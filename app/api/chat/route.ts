import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { NextResponse } from 'next/server';

// OPENAI_API_KEY is read automatically from the environment by createOpenAI().
const alibaba = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'qwen-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(req: Request) {
  try {
    const { currentHtml, messages, newMessage, sourceText, sourceTitle, sourceUrl } =
      (await req.json()) as {
        currentHtml: string;
        messages: ChatMessage[];
        newMessage: string;
        sourceText?: string;
        sourceTitle?: string;
        sourceUrl?: string;
      };

    if (!newMessage || typeof newMessage !== 'string') {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const hasSource = !!(sourceText && typeof sourceText === 'string' && sourceText.trim());
    const sourceBlock = hasSource
      ? [
          '',
          '=== USER-PROVIDED REFERENCE SOURCE (attached for context) ===',
          'The original artifact was generated from the reference source below. Keep every edit consistent with it (definitions, notation, scope). Never mention the source itself in the artifact.',
          '--- BEGIN REFERENCE SOURCE ---',
          String(sourceText).slice(0, 60000),
          '--- END REFERENCE SOURCE ---',
        ].join(String.fromCharCode(10))
      : '';

    const systemPrompt = `You are an expert frontend developer specializing in interactive educational HTML artifacts.
You will receive an existing HTML lesson file and a user's edit request.

## OUTPUT PROTOCOL (CRITICAL - FOLLOW EXACTLY)

You MUST respond with:
1. A first line starting with "SUMMARY: " followed by ONE short sentence describing what I changed.
2. One or more patch blocks in EXACTLY this format:

<<<<<<< SEARCH
(a short verbatim snippet copied EXACTLY from the current HTML, 1-10 lines)
=======
(the replacement snippet)
>>>>>>> REPLACE

Rules for patch blocks:
- The SEARCH snippet must be copied character-for-character from the current HTML. Include just enough surrounding lines to be unique in the file.
- NEVER re-output the whole file. NEVER use markdown code fences. NEVER add explanations outside the SUMMARY line and patch blocks.
- To insert new content: pick a small existing snippet (like a closing tag of a section) and include it in SEARCH, then write it followed by the new content in REPLACE.
- To delete content: SEARCH the snippet, REPLACE with nothing (empty).
- Multiple small patches are better than one giant patch.
- Preserve all existing functionality (Plotly graphs, calculator, quiz, MathJax) unless the user asks to change it.
- All math must use \\( \\) inline and \\[ \\] display delimiters, same as the existing file.

If the user's request is a question rather than an edit (e.g. "what is this lesson about?"), answer briefly with a "SUMMARY: " line and no patch blocks.
If the request would require rewriting the entire file, still use small targeted patches.`;

    const apiMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: `Here is the current HTML:\n\n${currentHtml}\n\nUser Request: ${newMessage}${sourceBlock}`,
      },
    ];

    const result = await streamText({
      model: alibaba(MODEL),
      messages: apiMessages,
      temperature: 0.3,
    });

    return result.toTextStreamResponse();
  } catch (err: any) {
    console.error('[chat] error:', err);
    return NextResponse.json({ error: err.message || 'Chat failed' }, { status: 500 });
  }
}
