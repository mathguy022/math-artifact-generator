import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';

const alibaba = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,
});

const MODEL = process.env.OPENAI_MODEL || 'qwen-max';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { topic, objectives, specialInstructions, sourceText, sourceTitle, sourceUrl } =
      (await req.json()) as {
        topic?: string;
        objectives?: string;
        specialInstructions?: string;
        sourceText?: string;
        sourceTitle?: string;
        sourceUrl?: string;
      };

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ error: 'Topic is required.' }, { status: 400 });
    }

    const sourceIncluded = !!(sourceText && sourceText.trim());
    const sourceDigest = sourceIncluded
      ? `--- REFERENCE SOURCE (${sourceTitle || 'untitled'}${sourceUrl ? `, ${sourceUrl}` : ''}) ---\n${sourceText!.slice(0, 12000)}`
      : '(no reference source provided)';

    const prompt = [
      'You are a quality gate for an interactive math lesson generator. A user is about to generate a college-level interactive HTML math lesson.',
      '',
      `TOPIC: "${topic.trim()}"`,
      '',
      `LESSON OBJECTIVES (may be empty): ${objectives?.trim() || '(none provided - the model will author them)'}`,
      '',
      `SPECIAL INSTRUCTIONS (may be empty): ${specialInstructions?.trim() || '(none)'}`,
      '',
      `REFERENCE SOURCE (may be absent): ${sourceDigest}`,
      '',
      'TASK:',
      '1. If the topic is a recognizable, teachable mathematics subject (or the reference source makes the intent clear), reply PROCEED.',
      '2. Otherwise, if some missing or ambiguous information makes the request unclear enough to risk producing the WRONG lesson, reply with EXACTLY ONE concise clarifying question for the user.',
      '3. NEVER ask about anything the app already handles (e.g., missing objectives, missing instructions, interactive sections, difficulty, word count - defaults exist for all of those).',
      '4. If the topic merely looks mis-typed but the intent is guessable, PROCEED with your best interpretation instead of asking.',
      '5. Do not lecture. Question, if any, must be one short sentence.',
      '',
      'OUTPUT FORMAT (exactly one of):',
      'PROCEED',
      'QUESTION: <your single concise question>',
    ].join('\n');

    const result = await generateText({
      model: alibaba(MODEL),
      prompt,
      temperature: 0,
      maxTokens: 100,
    });

    const text = (result.text || '').trim();
    const qMatch = text.match(/^QUESTION:\s*(.+)$/is);
    if (qMatch) {
      return NextResponse.json({ action: 'question', question: qMatch[1].trim() });
    }
    if (/^proceed\b/i.test(text)) {
      return NextResponse.json({ action: 'proceed' });
    }
    // Fail open: never block generation because the check misbehaved.
    return NextResponse.json({ action: 'proceed' });
  } catch (err: any) {
    console.error('[preflight] error:', err);
    // Fail open.
    return NextResponse.json({ action: 'proceed' });
  }
}
