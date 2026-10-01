export function stripCodeFences(text: string): string {
  if (!text) return '';
  let cleaned = text.trim();
  // Strip a leading ```html / ``` opening fence line, even mid-stream or when
  // the closing fence is missing or extra text follows the doc.
  cleaned = cleaned.replace(/^```(?:html|HTML)?\s*\r?\n/, '');
  // Drop everything after the closing </html> tag: the model sometimes emits
  // trailing junk like ```html ... ``` (a duplicated closing chunk) after it.
  const endIdx = cleaned.toLowerCase().lastIndexOf('</html>');
  if (endIdx !== -1) {
    cleaned = cleaned.slice(0, endIdx + '</html>'.length);
  }
  // Full-document fence pattern (both fences present, nothing outside).
  const fenceRegex = /^```(?:html|HTML)?\s*([\s\S]*?)\s*```$/;
  const match = cleaned.match(fenceRegex);
  if (match) return match[1].trim();
  return cleaned.trim();
}
