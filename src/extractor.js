import { generateJson } from "./llm.js";
import { extractionPrompt } from "./prompt.js";
import { validateRelations } from "./schema.js";
import { mockExtraction } from "./mock.js";
import { repairCandidates } from "./json-repair.js";

// Extractor: one LLM call → relations JSON. Retries once on invalid JSON/schema
// or provider errors (rate limits, 503s) with a short backoff.
// On JSON parse failure, attempts deterministic repair of truncated output —
// salvage complete relations, drop the incomplete tail, never fabricate values.
// Returns { relations, invalid, attempts, repaired? } — invalid relations are
// counted, never judged.

const SYSTEM =
  "You are the extraction layer of an audit tool. You never verify anything and never issue verdicts. You only extract numeric relations that a business document explicitly states. Respond with valid JSON only.";

function parseWithRepair(raw) {
  try {
    return { parsed: JSON.parse(raw), repaired: false };
  } catch {
    for (const candidate of repairCandidates(raw)) {
      try {
        return { parsed: JSON.parse(candidate), repaired: true };
      } catch {
        // next candidate
      }
    }
    return null;
  }
}

export async function extract(config, text) {
  if (config.mock) {
    return { relations: mockExtraction(text), invalid: [], attempts: 1, mock: true };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const suffix =
        attempt > 1 && lastError
          ? `\n\nYour previous response was rejected: ${lastError}. Return ONLY complete, strict JSON — the full array must end with "]}" and every relation must be complete. Do not truncate.`
          : "";
      const raw = await generateJson(config, {
        system: SYSTEM,
        prompt: extractionPrompt(text) + suffix,
      });
      const result = parseWithRepair(raw);
      if (!result) throw new Error("response is not valid JSON and could not be repaired");
      const { relations, invalid } = validateRelations(result.parsed);
      if (result.repaired) {
        invalid.push({ id: null, reason: "schema-invalid: truncated output — tail relation dropped" });
      }
      return { relations, invalid, attempts: attempt, mock: false, repaired: result.repaired };
    } catch (e) {
      lastError = e.message;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Extraction failed after 2 attempts: ${lastError}`);
}
