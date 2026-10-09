// Deterministic repair for truncated LLM JSON output.
// When a model runs out of output budget mid-array, we salvage the complete
// relations and drop the incomplete tail — recall loss of one relation,
// never a hallucinated value.

export function repairCandidates(raw) {
  const s = String(raw ?? "").trim();
  const candidates = [];
  // model stopped right after the opening — close everything
  candidates.push(s + "]}");
  // cut after the last complete relation separator "},"
  const lastSep = s.lastIndexOf("},");
  if (lastSep !== -1) candidates.push(s.slice(0, lastSep + 1) + "]}");
  // cut after the last "}}" (end of a nested object followed by array close attempt)
  const lastDouble = s.lastIndexOf("}}");
  if (lastDouble !== -1) candidates.push(s.slice(0, lastDouble + 2) + "]}");
  return [...new Set(candidates)];
}
