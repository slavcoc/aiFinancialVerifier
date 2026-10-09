// Grounding: every span the LLM returns must exist verbatim in the source document.
// The LLM supplies structure, never values — the verifier re-checks each span here.
// locateSpan/locateRelation also return character offsets in the ORIGINAL text,
// so the UI can highlight exactly what was checked.

export function normalizeWs(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

// Collapse whitespace runs while recording, for each normalized character,
// its index in the original text.
function buildNormWithMap(orig) {
  const map = [];
  let out = "";
  let i = 0;
  const n = orig.length;
  while (i < n) {
    const ch = orig[i];
    if (/\s/.test(ch)) {
      const runStart = i;
      while (i < n && /\s/.test(orig[i])) i++;
      out += " ";
      map.push(runStart);
    } else {
      out += ch;
      map.push(i);
      i++;
    }
  }
  return { norm: out, map };
}

function findInNorm(norm, spanNorm) {
  let idx = norm.indexOf(spanNorm);
  if (idx === -1) {
    // tolerate a trailing punctuation mark the model may have trimmed
    const stripped = spanNorm.replace(/[.,;:!?"'\u2019)\]]+$/, "");
    if (stripped.length > 0) idx = norm.indexOf(stripped);
  }
  return idx;
}

export function locateSpan(text, span) {
  const s = normalizeWs(span);
  if (!s) return null;
  const { norm, map } = buildNormWithMap(String(text ?? ""));
  const idx = findInNorm(norm, s);
  if (idx === -1) return null;
  const endIdx = idx + s.length - 1;
  return { start: map[idx], end: map[endIdx] + 1 };
}

export function spanExists(text, span) {
  return locateSpan(text, span) !== null;
}

export function relationSpans(rel) {
  const out = [];
  const push = (span) => {
    if (span && typeof span.text === "string" && span.text.trim()) out.push(span);
  };
  switch (rel.type) {
    case "sum":
      (rel.parts ?? []).forEach(push);
      push(rel.total);
      break;
    case "difference":
      push(rel.a); push(rel.b); push(rel.result);
      break;
    case "percent-of":
      push(rel.pct); push(rel.base); push(rel.result);
      break;
    case "percent-change":
      push(rel.from); push(rel.to); push(rel.pct);
      break;
    case "year-elapsed":
      push(rel.year); push(rel.n_years); push(rel.refYear);
      break;
    case "duplicate-value":
      push(rel.a); push(rel.b);
      break;
    case "product":
      push(rel.rate); push(rel.qty); push(rel.total);
      break;
    case "comparison":
      push(rel.a); push(rel.b);
      break;
    case "ratio":
      push(rel.numerator); push(rel.denominator); push(rel.result);
      break;
    default:
      break;
  }
  return out;
}

export function spansExist(text, rel) {
  return relationSpans(rel).every((span) => spanExists(text, span.text));
}

// Returns [{ text, kind, start, end }] for every span of the relation,
// or null if any span is not in the document.
export function locateRelation(text, rel) {
  const located = [];
  for (const span of relationSpans(rel)) {
    const pos = locateSpan(text, span.text);
    if (!pos) return null;
    located.push({ text: span.text, kind: span.kind, ...pos });
  }
  return located;
}
