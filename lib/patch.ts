/**
 * SEARCH/REPLACE patch engine for iterative chat editing.
 *
 * The chat model returns one or more patch blocks:
 *
 *   <<<<<<< SEARCH
 *   <exact existing HTML snippet>
 *   =======
 *   <replacement HTML snippet>
 *   >>>>>>> REPLACE
 *
 * followed optionally by a summary line. This module parses those blocks and
 * applies them to the current HTML string with exact-then-fuzzy matching.
 */

export interface PatchBlock {
  search: string;
  replace: string;
}

export interface PatchApplyResult {
  html: string;
  applied: number;
  failed: { index: number; search: string; reason: string }[];
}

/** Parse raw model output into patch blocks. Returns null if no blocks found. */
export function parsePatchBlocks(output: string): PatchBlock[] | null {
  const blocks: PatchBlock[] = [];
  // Accept 3-7 marker chars on each side, optional \r, tolerate leading/trailing
  // whitespace on marker lines, and both >>>>>>> REPLACE and >>>>>>> markers.
  const re =
    /^<{3,7}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n={3,7}\s*\r?\n([\s\S]*?)\r?\n>{3,7}\s*(?:REPLACE)?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(output)) !== null) {
    blocks.push({ search: m[1], replace: m[2] });
  }
  return blocks.length > 0 ? blocks : null;
}

/** Extract a summary line like "SUMMARY: ..." from model output. Tolerates a leading BOM. */
export function extractSummary(output: string): string | null {
  const m = output.replace(/^\uFEFF/, '').match(/^SUMMARY:\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

/** True if output looks like a complete standalone HTML document. */
export function isCompleteHtmlDoc(text: string): boolean {
  const t = text.trim();
  return /^<!doctype html/i.test(t) && /<\/html>\s*$/i.test(t);
}

/** Normalize whitespace for fuzzy comparison: collapse runs of whitespace. */
function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Escape a string for literal use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a fuzzy regex from a search snippet: whitespace-flexible, and the
 * first/last 8 alphanumerics are anchored literally so we match the intended
 * region, not an arbitrary whitespace-variant elsewhere in the doc.
 */
function buildFuzzyRegex(search: string): RegExp | null {
  const norm = normalizeWs(search);
  if (!norm) return null;
  // Split into words, join with flexible whitespace.
  const words = norm.split(' ').map(escapeRegExp);
  const pattern = words.join('\\s+');
  try {
    return new RegExp(pattern, 'm');
  } catch {
    return null;
  }
}

/**
 * Apply patch blocks to html. Exact match first, then whitespace-flexible
 * fuzzy match. Blocks that fail to match are reported, not fatal: the other
 * blocks still apply.
 */
export function applyPatches(html: string, blocks: PatchBlock[]): PatchApplyResult {
  let current = html;
  const failed: PatchApplyResult['failed'] = [];
  let applied = 0;

  blocks.forEach((block, index) => {
    if (!block.search.trim()) {
      failed.push({ index, search: block.search, reason: 'Empty SEARCH block' });
      return;
    }

    // 1. Exact match.
    const exactIdx = current.indexOf(block.search);
    if (exactIdx !== -1) {
      current =
        current.slice(0, exactIdx) +
        block.replace +
        current.slice(exactIdx + block.search.length);
      applied++;
      return;
    }

    // 2. Whitespace-flexible fuzzy match.
    const re = buildFuzzyRegex(block.search);
    if (re) {
      const m = current.match(re);
      if (m && typeof m.index === 'number') {
        current =
          current.slice(0, m.index) +
          block.replace +
          current.slice(m.index + m[0].length);
        applied++;
        return;
      }
    }

    failed.push({
      index,
      search: block.search.slice(0, 200),
      reason:
        'SEARCH snippet not found in current HTML (it may have been changed by a previous edit)',
    });
  });

  return { html: current, applied, failed };
}
