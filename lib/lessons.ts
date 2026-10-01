/**
 * localStorage persistence for generated lessons.
 * NOTE: client-only. All functions guard for SSR.
 */

export interface SavedLesson {
  id: string;
  name: string;
  topic: string;
  html: string;
  chat: { role: 'user' | 'assistant'; content: string }[];
  savedAt: number;
}

const KEY = 'math-artifact-lessons-v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function listLessons(): SavedLesson[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLesson(
  lesson: Omit<SavedLesson, 'id' | 'savedAt'>
): SavedLesson | null {
  if (!isBrowser()) return null;
  const lessons = listLessons();
  const entry: SavedLesson = {
    ...lesson,
    id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  lessons.unshift(entry);
  try {
    localStorage.setItem(KEY, JSON.stringify(lessons));
    return entry;
  } catch {
    // Most likely quota exceeded (lessons are large HTML strings).
    return null;
  }
}

export function deleteLesson(id: string): void {
  if (!isBrowser()) return;
  const lessons = listLessons().filter((l) => l.id !== id);
  localStorage.setItem(KEY, JSON.stringify(lessons));
}

export function formatSavedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}
