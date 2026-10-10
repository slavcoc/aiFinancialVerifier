// Paste normalization. Reports copied from some sources (LLM chat UIs, PDFs,
// wrapped web layouts) replace real line breaks with invisible characters that
// render as *nothing* and are not whitespace to JS regexes — so the textarea shows
// one jammed line and URL detection swallows the following text.
//
//   U+200B zero-width space   → line break (a break *opportunity* marker: when it
//   U+FEFF zero-width no-break   sits between two lines, restore the newline)
//   U+2060 word joiner         → removed (suppresses breaks; noise in pasted text)
//   U+00AD soft hyphen         → removed (invisible hyphenation marker)

const LINE_SEPARATORS = /[\u200B\uFEFF]/g;
const REMOVE = /[\u2060\u00AD]/g;

export function normalizePastedText(pasted: string): string {
  if (!LINE_SEPARATORS.test(pasted) && !REMOVE.test(pasted)) return pasted;
  return pasted.replace(LINE_SEPARATORS, "\n").replace(REMOVE, "");
}
