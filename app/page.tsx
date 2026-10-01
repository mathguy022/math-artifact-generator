'use client';

import { useState, useRef } from 'react';
import {
  BookOpen,
  Sparkles,
  Loader2,
  Wand2,
  Link2,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  UploadCloud,
} from 'lucide-react';
import ChatPanel, { type ChatMessage } from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import LessonsPanel from './components/LessonsPanel';
import { stripCodeFences } from '@/lib/utils';
import { parsePatchBlocks, extractSummary, applyPatches, isCompleteHtmlDoc } from '@/lib/patch';

type SourceMode = 'file' | 'link' | 'text';

interface ResolvedSource {
  text: string;
  title: string;
  url: string;
}

export default function Home() {
  const [topic, setTopic] = useState('');
  const [objectives, setObjectives] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [includeChallenge, setIncludeChallenge] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);
  const [include3DGraph, setInclude3DGraph] = useState(false);
  const [includeSolver, setIncludeSolver] = useState(false);
  const [includeFlashcards, setIncludeFlashcards] = useState(false);

  // Reference source state
  const [sourceMode, setSourceMode] = useState<SourceMode>('link');
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [sourcePasted, setSourcePasted] = useState('');
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<ResolvedSource | null>(null);
  const [isFetchingSource, setIsFetchingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  // Pre-flight clarification state
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [clarifyAnswer, setClarifyAnswer] = useState('');
  const [isChecking, setIsChecking] = useState(false);

  const [htmlContent, setHtmlContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChatting, setIsChatting] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  // Keeps the source that produced the current artifact, so chat edits stay aligned.
  const activeSourceRef = useRef<ResolvedSource | null>(null);

  /** Resolve the source the user configured right now (link fetch or pasted text). */
  function currentSourceOrNull(): ResolvedSource | null {
    if (sourceMode === 'link' && source) return source;
    if (sourceMode === 'text' && sourcePasted.trim()) {
      return { text: sourcePasted.trim(), title: 'Pasted source text', url: '' };
    }
    if (sourceMode === 'file' && source) return source;
    return null;
  }

  async function handleLoadLink() {
    const url = sourceUrlInput.trim();
    if (!url) {
      setSourceError('Paste a link first.');
      return;
    }
    setIsFetchingSource(true);
    setSourceError(null);
    setSource(null);
    try {
      const res = await fetch('/api/fetch-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Could not read that link (HTTP ${res.status}).`);
      setSource({ text: data.text, title: data.title || 'Source', url: data.url || url });
      if (data.truncated) {
        setSourceError('Source was long and has been trimmed to the first part for this lesson.');
      }
    } catch (e: any) {
      setSourceError(e.message || 'Could not read that link.');
    } finally {
      setIsFetchingSource(false);
    }
  }

  async function handleUploadFile(f: File) {
    if (!f) return;
    setIsUploadingFile(true);
    setSourceError(null);
    setSource(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload-source', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Could not read that file (HTTP ${res.status}).`);
      setSource({ text: data.text, title: data.title || f.name, url: '' });
      if (data.truncated) {
        setSourceError('File was long and has been trimmed to the first part for this lesson.');
      }
    } catch (e: any) {
      setSourceError(e.message || 'Could not read that file.');
    } finally {
      setIsUploadingFile(false);
    }
  }

  function clearSource() {
    setSource(null);
    setSourceUrlInput('');
    setSourcePasted('');
    setSourceError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function streamFromEndpoint(
    url: string,
    body: any,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (e: any) => void
  ) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server error ${res.status}: ${txt}`);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        onChunk(chunk);
      }
      onDone();
    } catch (e) {
      onError(e);
    }
  }

  /** Actually generate the artifact (assumes topic validated and source resolved). */
  async function runGeneration(resolved: ResolvedSource | null, extraInstruction: string) {
    const mergedInstructions = [specialInstructions.trim(), extraInstruction.trim()]
      .filter(Boolean)
      .join('\n\n');

    setError(null);
    setPendingQuestion(null);
    setClarifyAnswer('');
    setIsGenerating(true);
    setHtmlContent('');
    setChatMessages([]);
    setTruncated(false);
    activeSourceRef.current = resolved;

    let accumulator = '';
    await streamFromEndpoint(
      '/api/generate',
      {
        topic,
        objectives,
        specialInstructions: mergedInstructions,
        includeChallenge,
        questionCount,
        include3DGraph,
        includeSolver,
        includeFlashcards,
        sourceText: resolved?.text || '',
        sourceTitle: resolved?.title || '',
        sourceUrl: resolved?.url || '',
      },
      (chunk) => {
        accumulator += chunk;
        setHtmlContent(stripCodeFences(accumulator));
      },
      () => {
        setIsGenerating(false);
        const cleaned = stripCodeFences(accumulator).trim();
        setTruncated(cleaned.length > 0 && !/<\/html>\s*$/i.test(cleaned));
      },
      (e) => {
        console.error(e);
        setError(e.message || 'Generation failed');
        setIsGenerating(false);
      }
    );
  }

  /** Validate input, read the source, run the pre-flight check, then generate (or ask). */
  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) {
      setError('Topic is required — it is the only mandatory field.');
      return;
    }
    setError(null);

    // Resolve the optional reference source first.
    let resolved: ResolvedSource | null = null;
    if (sourceMode === 'file') {
      resolved = source;
    } else if (sourceMode === 'link') {
      if (!source && sourceUrlInput.trim()) {
        // User pasted a link but never clicked Load — load it now.
        await handleLoadLink();
        setError('Source link loaded. Click "Generate Artifact" again to build the lesson from it.');
        return;
      }
      resolved = source;
    } else if (sourceMode === 'text') {
      resolved = sourcePasted.trim()
        ? { text: sourcePasted.trim(), title: 'Pasted source text', url: '' }
        : null;
    }

    // Pre-flight: let the model ask ONE clarifying question if the request is truly ambiguous.
    setIsChecking(true);
    try {
      const res = await fetch('/api/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          objectives,
          specialInstructions,
          sourceText: resolved?.text || '',
          sourceTitle: resolved?.title || '',
          sourceUrl: resolved?.url || '',
        }),
      });
      const data = await res.json();
      if (data?.action === 'question' && data.question) {
        setPendingQuestion(data.question);
        setIsChecking(false);
        return; // wait for the user's answer
      }
    } catch {
      // Fail open: never block generation on a pre-flight failure.
    }
    setIsChecking(false);

    await runGeneration(resolved, '');
  }

  async function handleConfirmClarification() {
    const resolved = currentSourceOrNull();
    const extra = clarifyAnswer.trim()
      ? `Additional clarification from the course instructor: ${clarifyAnswer.trim()}`
      : '';
    await runGeneration(resolved, extra);
  }

  async function handleChatSend(message: string) {
    setError(null);
    setIsChatting(true);
    const userMsg: ChatMessage = { role: 'user', content: message };
    setChatMessages((prev) => [...prev, userMsg]);

    const activeSource = activeSourceRef.current;
    let accumulator = '';
    let lastError: string | null = null;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentHtml: htmlContent,
          messages: chatMessages,
          newMessage: message,
          sourceText: activeSource?.text || '',
          sourceTitle: activeSource?.title || '',
          sourceUrl: activeSource?.url || '',
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server error ${res.status}: ${txt}`);
      }
      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulator += decoder.decode(value, { stream: true });
      }

      const summary = extractSummary(accumulator);
      const blocks = parsePatchBlocks(accumulator);
      if (blocks) {
        const result = applyPatches(htmlContent, blocks);
        setHtmlContent(result.html);
        setTruncated(!/<\/html>\s*$/i.test(result.html.trimEnd()));
        const failureNote =
          result.failed.length > 0
            ? ` (${result.failed.length} of ${blocks.length} edits failed to apply: ${result.failed[0].reason})`
            : '';
        setChatMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: summary
              ? `${summary}${failureNote}`
              : `Applied ${result.applied} of ${blocks.length} edits.${failureNote}`,
          },
        ]);
      } else if (isCompleteHtmlDoc(stripCodeFences(accumulator))) {
        setHtmlContent(stripCodeFences(accumulator));
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: summary || 'Replaced the full artifact.' },
        ]);
      } else if (summary && !/patch|search/i.test(accumulator)) {
        setChatMessages((prev) => [...prev, { role: 'assistant', content: summary }]);
      } else {
        lastError = 'The model did not return valid edits. Please rephrase and try again.';
      }
    } catch (e: any) {
      console.error(e);
      lastError = e.message || 'Chat update failed';
    }

    if (lastError) {
      setError(lastError);
      setChatMessages((prev) => prev.slice(0, -1));
    }
    setIsChatting(false);
  }

  function handleReset() {
    if (!confirm('Reset everything and start over?')) return;
    setHtmlContent('');
    setChatMessages([]);
    setError(null);
    setPendingQuestion(null);
    activeSourceRef.current = null;
  }

  function handleOpenLesson(lesson: { name: string; topic: string; html: string; chat: ChatMessage[] }) {
    setTopic(lesson.topic);
    setHtmlContent(lesson.html);
    setChatMessages(lesson.chat);
    setError(null);
    setIsGenerating(false);
    setTruncated(!/<\/html>\s*$/i.test(lesson.html.trimEnd()));
  }

  const busy = isGenerating || isChecking || isFetchingSource || isUploadingFile;
  const resolvedPreview = sourceMode === 'link' || sourceMode === 'file' ? source : null;

  return (
    <main className="h-screen flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white">
          <BookOpen size={18} />
        </div>
        <div>
          <h1 className="font-bold text-lg text-slate-900 leading-tight">
            Interactive Lesson Artifact Generator
          </h1>
          <p className="text-xs text-slate-500">
            College-level Mathematics - AI-powered with iterative chat editing
          </p>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 p-4 overflow-hidden">
        <div className="flex flex-col gap-4 overflow-y-auto scrollbar-thin lg:pr-1">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Wand2 size={16} className="text-brand-600" />
              <h2 className="font-semibold text-slate-800">Generate Artifact</h2>
            </div>
            <LessonsPanel
              hasContent={!!htmlContent && !isGenerating}
              currentTopic={topic}
              currentHtml={htmlContent}
              currentChat={chatMessages}
              onOpen={handleOpenLesson}
            />
            <form onSubmit={handleGenerate} className="space-y-3 mt-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Topic <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-slate-400">(required)</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., Integration by Parts"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* ---- Optional reference source ---- */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
                  <label className="block text-xs font-medium text-slate-700">
                    Reference Source{' '}
                    <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  {source && (
                    <button
                      type="button"
                      onClick={clearSource}
                      className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                    >
                      <X size={12} /> Clear
                    </button>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-lg">
                    {(
                      [
                        { key: 'file', label: 'Upload file' },
                        { key: 'link', label: 'Link' },
                        { key: 'text', label: 'Paste text' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setSourceMode(m.key)}
                        className={`py-1.5 rounded-md text-xs font-medium transition ${
                          sourceMode === m.key
                            ? 'bg-white text-brand-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {sourceMode === 'file' && (
                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.md,.markdown,.csv,.tex,.html,.htm"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadFile(f);
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingFile}
                        className="w-full py-3 border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 rounded-lg text-sm text-slate-600 transition flex flex-col items-center gap-1 disabled:opacity-60"
                      >
                        {isUploadingFile ? (
                          <>
                            <Loader2 size={18} className="animate-spin text-brand-600" />
                            <span>Reading file...</span>
                          </>
                        ) : (
                          <>
                            <UploadCloud size={18} className="text-brand-600" />
                            <span className="font-medium">Click to upload a source file</span>
                            <span className="text-[11px] text-slate-400">PDF, TXT, MD, CSV, TEX or HTML - up to 10 MB</span>
                          </>
                        )}
                      </button>
                      <p className="text-[11px] text-slate-500">
                        The model will read the file and use it as the main source material.
                      </p>
                    </div>
                  )}

                  {sourceMode === 'link' && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Link2
                            size={14}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                          />
                          <input
                            type="url"
                            value={sourceUrlInput}
                            onChange={(e) => setSourceUrlInput(e.target.value)}
                            placeholder="https://..."
                            className="w-full pl-8 pr-2 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleLoadLink}
                          disabled={isFetchingSource}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium disabled:opacity-60 flex items-center gap-1.5"
                        >
                          {isFetchingSource ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            'Load'
                          )}
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        The model will read the page and use it as the main source material.
                      </p>
                    </div>
                  )}

                  {sourceMode === 'text' && (
                    <div className="space-y-1">
                      <textarea
                        value={sourcePasted}
                        onChange={(e) => setSourcePasted(e.target.value)}
                        rows={4}
                        placeholder="Paste lesson notes, a textbook excerpt, or any source material..."
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                      />
                      <p className="text-[11px] text-slate-500">
                        {sourcePasted.trim()
                          ? `${sourcePasted.trim().length.toLocaleString()} characters will be used as the main source.`
                          : 'Pasted text is used as the main source material.'}
                      </p>
                    </div>
                  )}

                  {resolvedPreview && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                      <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-emerald-800 truncate">
                          {resolvedPreview.title}
                        </p>
                        <p className="text-[10px] text-emerald-700">
                          {resolvedPreview.text.length.toLocaleString()} characters loaded
                        </p>
                      </div>
                    </div>
                  )}

                  {sourceError && (
                    <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
                      <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-amber-800">{sourceError}</p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lesson Objectives{' '}
                  <span className="font-normal text-slate-400">(optional — auto-generated if blank)</span>
                </label>
                <textarea
                  value={objectives}
                  onChange={(e) => setObjectives(e.target.value)}
                  rows={2}
                  placeholder="Leave blank and the model writes rigorous college-level objectives for you."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Instructions{' '}
                  <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  rows={2}
                  placeholder="e.g., Use a dark theme, include 3 worked examples"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeChallenge}
                      onChange={(e) => setIncludeChallenge(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-slate-700">Include Mastery Challenge</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    disabled={!includeChallenge}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="w-16 px-2 py-1 border border-slate-300 rounded-md text-sm disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="text-xs font-medium text-slate-500">Extra interactive sections</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={include3DGraph}
                      onChange={(e) => setInclude3DGraph(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-slate-700">3D Surface Explorer</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeSolver}
                      onChange={(e) => setIncludeSolver(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-slate-700">Step-by-Step Solver</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeFlashcards}
                      onChange={(e) => setIncludeFlashcards(e.target.checked)}
                      className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-xs text-slate-700">Flashcard Review</span>
                  </label>
                </div>
              </div>

              {pendingQuestion && (
                <div className="rounded-lg border border-brand-200 bg-brand-50/60 p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <HelpCircle size={15} className="text-brand-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-brand-800">
                        One quick question before I generate
                      </p>
                      <p className="text-xs text-slate-700 mt-0.5">{pendingQuestion}</p>
                    </div>
                  </div>
                  <textarea
                    value={clarifyAnswer}
                    onChange={(e) => setClarifyAnswer(e.target.value)}
                    rows={2}
                    placeholder="Your answer (optional — you can also continue as-is)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmClarification}
                      disabled={busy}
                      className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      Continue generating
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingQuestion(null);
                        setClarifyAnswer('');
                      }}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-600 hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white rounded-lg font-medium text-sm disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shadow-sm"
              >
                {isUploadingFile ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Reading file...
                  </>
                ) : isFetchingSource ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Reading source...
                  </>
                ) : isChecking ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Reviewing your request...
                  </>
                ) : isGenerating ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    Generate Artifact
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="h-[420px] shrink-0">
            <ChatPanel
              messages={chatMessages}
              onSend={handleChatSend}
              isLoading={isChatting}
            />
          </div>
        </div>

        <div className="overflow-hidden">
          <PreviewPanel
            htmlContent={htmlContent}
            isLoading={isGenerating}
            onReset={handleReset}
            truncated={truncated}
          />
        </div>
      </div>
    </main>
  );
}
