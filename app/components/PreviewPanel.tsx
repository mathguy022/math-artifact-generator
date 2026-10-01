import { Download, Copy, RotateCcw, Check, Eye, Printer, FileText } from 'lucide-react';
import { useState } from 'react';

interface Props {
  htmlContent: string;
  isLoading: boolean;
  onReset: () => void;
  truncated?: boolean;
}

export default function PreviewPanel({ htmlContent, isLoading, onReset, truncated }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copy failed - try downloading instead.');
    }
  }

  function handleDownload() {
    if (!htmlContent) return;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `artifact-${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handlePrintPdf() {
    if (!htmlContent) return;
    const w = window.open('', '_blank');
    if (!w) {
      alert('Popup blocked - allow popups to export PDF.');
      return;
    }
    w.document.write(htmlContent);
    w.document.close();
    w.onload = () => w.print();
    // Fallback if load event already fired before onload was attached.
    setTimeout(() => {
      try { w.print(); } catch { /* already printing */ }
    }, 1500);
  }

  function handleWordExport() {
    if (!htmlContent) return;
    const wordDoc = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"></head><body>${htmlContent}</body></html>`;
    const blob = new Blob([wordDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lesson-${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-slate-700 to-slate-800 text-white flex items-center gap-2">
        <Eye size={18} />
        <h3 className="font-semibold">Live Preview</h3>
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleCopy}
            disabled={!htmlContent}
            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-40 transition flex items-center gap-1"
            title="Copy HTML"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            onClick={handleDownload}
            disabled={!htmlContent}
            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-40 transition flex items-center gap-1"
            title="Download HTML"
          >
            <Download size={12} />
            Download
          </button>
          <button
            onClick={handlePrintPdf}
            disabled={!htmlContent}
            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-40 transition flex items-center gap-1"
            title="Open in a new window and print / save as PDF"
          >
            <Printer size={12} />
            PDF
          </button>
          <button
            onClick={handleWordExport}
            disabled={!htmlContent}
            className="px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 rounded-md disabled:opacity-40 transition flex items-center gap-1"
            title="Download as Word document"
          >
            <FileText size={12} />
            Word
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-xs bg-red-500/80 hover:bg-red-500 rounded-md transition flex items-center gap-1"
            title="Reset"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </div>
      </div>

      <div className="flex-1 relative bg-slate-100">
        {isLoading && !htmlContent && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50 z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-600 text-sm">Generating your artifact...</p>
            </div>
          </div>
        )}
        {!htmlContent && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <div className="text-center">
              <p className="text-lg mb-2">📚</p>
              <p className="text-sm">Your interactive study guide will appear here.</p>
            </div>
          </div>
        )}
        {truncated && (
          <div className="absolute top-0 left-0 right-0 z-20 bg-amber-100 border-b border-amber-300 text-amber-900 text-xs px-4 py-2">
            ⚠️ This artifact appears to be incomplete (missing closing &lt;/html&gt;). Try regenerating, or ask the chat to "finish the remaining sections".
          </div>
        )}
        {htmlContent && (
          <iframe
            srcDoc={htmlContent}
            title="Artifact Preview"
            sandbox="allow-scripts allow-same-origin"
            className="w-full h-full border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
