import { FolderOpen, Trash2, Save, X } from 'lucide-react';
import { useState } from 'react';
import { listLessons, deleteLesson, saveLesson, formatSavedAt, type SavedLesson } from '@/lib/lessons';

interface Props {
  hasContent: boolean;
  currentTopic: string;
  currentHtml: string;
  currentChat: { role: 'user' | 'assistant'; content: string }[];
  onOpen: (lesson: SavedLesson) => void;
}

export default function LessonsPanel({ hasContent, currentTopic, currentHtml, currentChat, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [lessons, setLessons] = useState<SavedLesson[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  function refresh() {
    setLessons(listLessons());
  }

  function toggle() {
    if (!open) refresh();
    setOpen(!open);
  }

  function handleSave() {
    const name = (currentTopic || 'Untitled lesson').slice(0, 60);
    const saved = saveLesson({ name, topic: currentTopic, html: currentHtml, chat: currentChat });
    setNotice(saved ? `Saved "${name}".` : 'Save failed (browser storage may be full).');
    setTimeout(() => setNotice(null), 3000);
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this saved lesson?')) return;
    deleteLesson(id);
    refresh();
  }

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={!hasContent}
          className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-1.5 text-slate-700"
          title="Save current lesson + chat to this browser"
        >
          <Save size={14} />
          Save
        </button>
        <button
          onClick={toggle}
          className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition flex items-center gap-1.5 text-slate-700"
          title="Saved lessons"
        >
          <FolderOpen size={14} />
          My Lessons
          {open ? <X size={12} className="text-slate-400" /> : null}
        </button>
      </div>

      {notice && <p className="text-xs text-green-700 mt-1.5">{notice}</p>}

      {open && (
        <div className="mt-2 border border-slate-200 rounded-lg bg-slate-50 max-h-56 overflow-y-auto scrollbar-thin">
          {lessons.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No saved lessons yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {lessons.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2 hover:bg-white">
                  <button
                    onClick={() => {
                      onOpen(l);
                      setOpen(false);
                    }}
                    className="flex-1 text-left min-w-0"
                  >
                    <p className="text-sm font-medium text-slate-800 truncate">{l.name}</p>
                    <p className="text-xs text-slate-400">{formatSavedAt(l.savedAt)}</p>
                  </button>
                  <button
                    onClick={() => handleDelete(l.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
