import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SOURCE_CHARS = 60000;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 20000;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Convert an HTML document into readable plain text plus a best-effort title.
 * Scripts/styles/nav chrome are dropped and block tags become line breaks.
 */
function extractTextFromHtml(html: string): { title: string; text: string } {
  let work = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  let title = '';
  const titleMatch = work.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim();
  }

  // Prefer the main content region when one is clearly marked.
  const articleMatch = work.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i);
  if (articleMatch && articleMatch[1].length > 500) {
    work = articleMatch[1];
  } else {
    const bodyMatch = work.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) work = bodyMatch[1];

    if (!title) {
      const h1 = work.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (h1) title = decodeEntities(h1[1]).replace(/\s+/g, ' ').trim();
    }
  }

  const text = decodeEntities(
    work
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*li[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|blockquote|pre|ul|ol|table)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { title, text };
}

/** Fetch a URL, following redirects manually so we can validate each hop. */
async function safeFetch(url: string): Promise<Response> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return res;
      current = new URL(loc, current).toString();
      continue;
    }
    return res;
  }
  throw new Error('Too many redirects while fetching the source link.');
}

export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json({ error: 'A source link is required.' }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url.trim());
    } catch {
      return NextResponse.json(
        { error: 'That does not look like a valid link. Include the full URL, e.g. https://example.com/page' },
        { status: 400 }
      );
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return NextResponse.json({ error: 'Only http(s) links are supported.' }, { status: 400 });
    }

    let res: Response;
    try {
      res = await safeFetch(parsed.toString());
    } catch (e: any) {
      const msg =
        e?.name === 'AbortError'
          ? 'The source link took too long to respond.'
          : 'Could not reach that link. Check the URL and that the page is publicly accessible.';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `The source link returned HTTP ${res.status}. It may be private, moved, or blocked.` },
        { status: 502 }
      );
    }

    const contentType = res.headers.get('content-type') || '';
    const raw = await res.text();

    let title = '';
    let text = '';

    if (contentType.includes('text/html') || /<html[\s>]/i.test(raw)) {
      const extracted = extractTextFromHtml(raw);
      title = extracted.title;
      text = extracted.text;
    } else {
      text = raw.replace(/\r\n/g, '\n').trim();
    }

    if (!text || text.length < 40) {
      return NextResponse.json(
        {
          error:
            'That page did not contain readable text (it may load its content with JavaScript). Try a different link or paste the source text instead.',
        },
        { status: 422 }
      );
    }

    const truncated = text.length > MAX_SOURCE_CHARS;
    const finalText = truncated ? text.slice(0, MAX_SOURCE_CHARS) : text;

    return NextResponse.json({
      title: title || parsed.hostname,
      url: parsed.toString(),
      text: finalText,
      truncated,
      chars: finalText.length,
    });
  } catch (err: any) {
    console.error('[fetch-source] error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to read the source link.' }, { status: 500 });
  }
}
