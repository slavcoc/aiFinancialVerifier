// Structural validation of the extractor's JSON. Invalid relations are dropped and
// counted ("schema-invalid") — they never produce a verdict.

const TYPES = new Set([
  "sum",
  "difference",
  "percent-of",
  "percent-change",
  "year-elapsed",
  "duplicate-value",
  "product",
  "comparison",
  "ratio",
]);
const KINDS = new Set(["money", "pct", "year", "number"]);

function spanOk(s) {
  return (
    s &&
    typeof s === "object" &&
    typeof s.text === "string" &&
    s.text.trim().length > 0 &&
    (s.kind === undefined || KINDS.has(s.kind))
  );
}

function invalidReason(r) {
  if (!r || typeof r !== "object") return "schema-invalid: not an object";
  if (typeof r.id !== "string" || !r.id.trim()) return "schema-invalid: missing id";
  if (!TYPES.has(r.type)) return `schema-invalid: unknown type "${r.type}"`;
  if (r.source !== undefined && !["table", "prose"].includes(r.source))
    return 'schema-invalid: source must be "table" or "prose"';
  if (typeof r.label !== "string" || !r.label.trim()) return "schema-invalid: missing label";
  switch (r.type) {
    case "sum":
      return !Array.isArray(r.parts) || r.parts.length < 2 || r.parts.some((p) => !spanOk(p)) || !spanOk(r.total)
        ? "schema-invalid: sum needs parts[] (≥2) and total"
        : null;
    case "difference":
      return !spanOk(r.a) || !spanOk(r.b) || !spanOk(r.result)
        ? "schema-invalid: difference needs a, b, result"
        : null;
    case "percent-of":
      return !spanOk(r.pct) || !spanOk(r.base) || !spanOk(r.result)
        ? "schema-invalid: percent-of needs pct, base, result"
        : null;
    case "percent-change":
      return !spanOk(r.from) || !spanOk(r.to) || !spanOk(r.pct)
        ? "schema-invalid: percent-change needs from, to, pct"
        : null;
    case "year-elapsed":
      return !spanOk(r.year) || !spanOk(r.n_years) || !spanOk(r.refYear)
        ? "schema-invalid: year-elapsed needs year, n_years, refYear"
        : null;
    case "duplicate-value":
      return !spanOk(r.a) || !spanOk(r.b) ? "schema-invalid: duplicate-value needs a, b" : null;
    case "product":
      return !spanOk(r.rate) || !spanOk(r.qty) || !spanOk(r.total)
        ? "schema-invalid: product needs rate, qty, total"
        : null;
    case "comparison":
      return !spanOk(r.a) || !spanOk(r.b) || typeof r.claim !== "string" || !r.claim.trim()
        ? "schema-invalid: comparison needs a, b, claim"
        : null;
    case "ratio":
      return !spanOk(r.numerator) || !spanOk(r.denominator) || !spanOk(r.result)
        ? "schema-invalid: ratio needs numerator, denominator, result"
        : null;
    default:
      return null;
  }
}

export function validateRelations(parsed) {
  if (!parsed || !Array.isArray(parsed.relations)) {
    return { relations: [], invalid: [{ id: null, reason: "schema-invalid: missing relations array" }] };
  }
  const relations = [];
  const invalid = [];
  for (const item of parsed.relations) {
    const reason = invalidReason(item);
    if (reason) invalid.push({ id: item?.id ?? null, reason });
    else relations.push(item);
  }
  return { relations, invalid };
}
