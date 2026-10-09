// Canned extraction for GEMINI_MOCK=1 — pipeline testing without an API key.
// Returns the motivating example from ai-extraction-spec.md when the text contains
// the $150,000 total, otherwise no relations.

export function mockExtraction(text) {
  if (/\$150,000/.test(text) && /\$85,000/.test(text)) {
    return [
      {
        id: "r1",
        type: "sum",
        label: "departmental expenditure breakdown",
        parts: [
          { text: "$85,000", kind: "money" },
          { text: "$45,000", kind: "money" },
          { text: "$25,000", kind: "money" },
        ],
        total: { text: "$150,000", kind: "money" },
      },
    ];
  }
  return [];
}
