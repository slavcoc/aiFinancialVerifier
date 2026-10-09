import { generateJson } from "./llm.js";
import { validityPrompt } from "./prompt.js";

// Relation-validity pass: does the document EXPLICITLY state each relation?
// This is the precision guard — it catches the extractor inventing relations
// (e.g., pairing a total with parts the text never claimed add up).
// Callers must treat a thrown error as "fail closed": discard, never flag.

const SYSTEM =
  "You check whether a document explicitly states each relation. You never verify arithmetic. Respond with valid JSON only.";

export async function validityPass(config, text, relations) {
  if (relations.length === 0) return { stated: [], skipped: false };
  if (config.mock) {
    return { stated: relations.map((r) => ({ id: r.id, stated: true })), skipped: false };
  }

  const raw = await generateJson(config, {
    system: SYSTEM,
    prompt: validityPrompt(text, relations),
  });
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.stated)) {
    throw new Error("validity pass returned invalid JSON");
  }
  return { stated: parsed.stated, skipped: false };
}
