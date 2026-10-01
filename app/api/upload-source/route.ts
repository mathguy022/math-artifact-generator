import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SOURCE_CHARS = 60000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tex', '.rtf', '.html', '.htm'];

/**
 * Load pdf-parse through Node's native require so webpack never bundles it.
 * (Its pdfjs-dist ESM build breaks under Next 14's server bundler.)
 */
function loadPdfParse(): any {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const nativeRequire = eval('require') as NodeRequire;
  return nativeRequire('pdf-parse');
}

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

/** Convert HTML text to readable plain text (for .html uploads). */
function htmlToText(html: string): string {
  const work = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  return decodeEntities(
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
}

async function extractPdfText(buf: Buffer): Promise<string> {
  const { PDFParse } = loadPdfParse();
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    const pages: string[] =
      result?.pages?.map((p: any) => p?.text || '') ?? (result?.text ? [result.text] : []);
    const joined = pages
      .map((t) => t.replace(/\r\n/g, '\n').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();
    console.log(
      '[upload-source] pdf parse: total=',
      result?.total,
      'pages=',
      pages.length,
      'joined=',
      joined.length
    );
    return joined;
  } catch (e: any) {
    console.error('[upload-source] pdf parse threw:', e?.message || e);
    throw e;
  } finally {
    await parser.destroy();
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was uploaded.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File is too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB).` },
        { status: 413 }
      );
    }

    const name = file.name || 'upload';
    const lower = name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());

    let text = '';
    let kind = 'text';

    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      kind = 'pdf';
      try {
        text = await extractPdfText(buf);
      } catch (e: any) {
        const locked = /password/i.test(e?.message || '');
        return NextResponse.json(
          {
            error: locked
              ? 'That PDF is password-protected and cannot be read.'
              : 'Could not extract text from that PDF. It may be a scanned image - try a text-based PDF, or paste the text instead.',
          },
          { status: 422 }
        );
      }
    } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      kind = 'html';
      text = htmlToText(buf.toString('utf-8'));
    } else if (lower.endsWith('.docx')) {
      return NextResponse.json(
        {
          error:
            'Word (.docx) files are not supported yet. Please save the file as PDF or plain text, or paste the text instead.',
        },
        { status: 415 }
      );
    } else if (
      TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
      file.type.startsWith('text/') ||
      file.type === 'application/json'
    ) {
      kind = 'text';
      text = buf.toString('utf-8').replace(/\r\n/g, '\n').trim();
    } else {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Supported: PDF, TXT, MD, CSV, TEX, HTML. You can always paste the source text instead.',
        },
        { status: 415 }
      );
    }

    if (!text || text.replace(/\s/g, '').length < 10) {
      return NextResponse.json(
        {
          error:
            'No readable text was found in that file (it may be a scanned image). Try a text-based file, or paste the text instead.',
        },
        { status: 422 }
      );
    }

    const truncated = text.length > MAX_SOURCE_CHARS;
    const finalText = truncated ? text.slice(0, MAX_SOURCE_CHARS) : text;

    return NextResponse.json({
      title: name,
      fileName: name,
      kind,
      text: finalText,
      truncated,
      chars: finalText.length,
    });
  } catch (err: any) {
    console.error('[upload-source] error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to read the uploaded file.' }, { status: 500 });
  }
}
