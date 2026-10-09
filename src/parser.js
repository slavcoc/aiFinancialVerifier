// Deterministic number parser. The LLM never parses values — it supplies raw text
// spans, and this module converts them to numbers. Unit-tested; no tolerance logic here.

const SUFFIXES = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const WORDS = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const CURRENCY_WORDS = /(usd|eur|gbp|jpy|dollars?|euros?|pounds?|yen)\s*$/i;

export function parseValue(text, kind) {
  let t = String(text ?? "").trim();
  if (!t) return null;

  // years: accept "2024", "FY2024", "in 2024" → keep only digits, require 4
  if (kind === "year") {
    const digits = t.replace(/[^\d]/g, "");
    return /^\d{4}$/.test(digits) ? Number(digits) : null;
  }

  // accounting negatives: "(1,200)"
  let neg = false;
  if (t.startsWith("(") && t.endsWith(")")) {
    neg = true;
    t = t.slice(1, -1).trim();
  }

  // word multipliers: "2.5 million"
  let mult = 1;
  const word = t.match(/(thousand|million|billion|trillion)\s*$/i);
  if (word) {
    mult = WORDS[word[1].toLowerCase()];
    t = t.slice(0, word.index).trim();
  }

  // percent signs/words (strip for any kind; only matters semantically for pct)
  t = t.replace(/%/g, "").replace(/percent|per\s*cent|pct/gi, "").trim();

  // currency words and symbols
  t = t.replace(CURRENCY_WORDS, "").replace(/[$€£¥₹]/g, "").trim();

  // letter multipliers: "1.2M"
  const letter = t.match(/([kmbt])\s*$/i);
  if (letter) {
    mult *= SUFFIXES[letter[1].toLowerCase()];
    t = t.slice(0, letter.index).trim();
  }

  if (!t) return null;

  // unicode minus / thin spaces used as thousand separators
  t = t.replace(/\u2212/g, "-").replace(/[\u00A0\u202F]/g, " ").replace(/\s/g, "");

  // separator disambiguation:
  // both "," and "." present → the LAST one is the decimal separator
  if (t.includes(",") && t.includes(".")) {
    if (t.lastIndexOf(",") > t.lastIndexOf(".")) {
      t = t.replace(/\./g, "").replace(",", "."); // European: 4.500,50
    } else {
      t = t.replace(/,/g, ""); // US: 1,234.56
    }
  } else if (t.includes(",") && !t.includes(".")) {
    const groups = t.split(",").slice(1);
    t = groups.every((g) => g.length === 3) ? t.replace(/,/g, "") : t.replace(/,/g, ".");
  }

  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return (neg ? -n : n) * mult;
}
