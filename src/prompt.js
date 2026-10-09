// Prompts for the two LLM calls. Both are extraction/classification jobs — the LLM
// never verifies and never issues verdicts.

export function extractionPrompt(text) {
  return `You are the extraction layer of an audit tool. You never verify anything and never issue verdicts. You only extract numeric relations that a business document EXPLICITLY states, and return them as strict JSON.

Input document:
<document>
${text}
</document>

Extract relations of these 9 types ONLY:
- "sum": parts[] + total — the text states these parts add up to the total ("total", "combined", "subtotal", "in total", or a Total/Subtotal table row)
- "difference": a, b, result — the text states a minus b equals result ("difference", "net of", "after subtracting", or a derived table row like Gross Profit / Operating Income)
- "percent-of": pct, base, result — the text states X% of B is R ("margin of X%", "X% of B is R")
- "percent-change": from, to, pct — the text states a change from A to B as P% ("increased by", "expanded by", "grew", "year-over-year")
- "year-elapsed": year, n_years, refYear — the text states N years after YEAR is REFYEAR
- "duplicate-value": a, b — the text states two figures are the same value
- "product": rate, qty, total — the text states rate × quantity = total
- "comparison": a, b, claim — the text states a relative comparison; claim is one of: "exceeds", "half-of", "double", "triple", "×N" where N is a number
- "ratio": numerator, denominator, result — the text states N divided by D equals R (per-share figures, averages, rates)

READING TABLES AND FINANCIAL STATEMENTS:
1. Tables may use | pipes or column alignment. Ignore the pipes; read each row by its row label.
2. A row labeled "Total X", "Total", "Subtotal", "Combined" states a SUM of the component rows listed above it in the same section.
3. Rows like "Gross Profit", "Operating Income (EBIT)", "Net Income" state a DIFFERENCE between the labeled rows they aggregate (e.g., Gross Profit = Total Revenue − Total Cost of Revenue).
4. A row that aggregates more than two components — including negatives shown in parentheses, e.g. "Income Before Income Taxes" = Operating Income + Interest Expense, net + Other Non-Operating Income — is a SUM with parts including the negative spans.
5. "expanded by 15.4% year-over-year", "increased by X%", "grew Y%" → percent-change (from = the earlier figure, to = the later figure).
6. "operating margin of roughly 6.1%" or "X% of Y is Z" → percent-of.
7. "Net Income Per Share - Basic" rows → ratio (numerator = the income figure, denominator = the shares-outstanding figure, result = the per-share figure).
8. Numbers in parentheses are negatives — keep the parentheses in the span.
9. If a derived row combines operands in a way that cannot be expressed exactly by one of the 9 types, DO NOT emit it. Missing a relation is acceptable; a wrong one is not.

HARD RULES:
1. Extract a relation ONLY if the document explicitly states the relationship via wording, row labels, or table structure. Never compute or infer a total, difference, or percentage yourself.
2. Every "text" field MUST be a verbatim substring of the document (whitespace-normalized). Copy the exact characters: "$85,000", "12%", "2023", "($180)", "52,100". Never rephrase, round, reformat, or normalize a figure.
3. Never parse or compute values. You supply raw text spans only.
4. "kind" must be one of: "money", "pct", "year", "number". Currency symbol/word → "money"; % sign or "percent" → "pct"; 4-digit date → "year"; otherwise "number".
5. "label" is a short human-readable description of what the text claims (max 12 words).
6. Assign ids r1, r2, r3... in document order.
7. Extract ALL relations you find — check every period/column of a table separately.
8. Every relation includes a "source" field: "table" if the relation comes from table rows/columns, or "prose" if it comes from narrative sentences.
9. Return ONLY valid JSON. No markdown fences, no commentary, no trailing text.

Example 1 (prose):
Input: "Total combined expenditure across all three core sectors reached exactly $150,000. The breakdown: Personnel: $85,000, Infrastructure: $45,000, Travel: $25,000."
Output: {"relations":[{"id":"r1","type":"sum","label":"departmental expenditure breakdown","source":"prose","parts":[{"text":"$85,000","kind":"money"},{"text":"$45,000","kind":"money"},{"text":"$25,000","kind":"money"}],"total":{"text":"$150,000","kind":"money"}}]}

Example 2 (table rows):
Input: "Research and Development (R&D) $4,120\nSales and Marketing (S&M) $4,850\nTotal Operating Expenses $11,100"
Output: {"relations":[{"id":"r1","type":"sum","label":"operating expenses total","source":"table","parts":[{"text":"$4,120","kind":"money"},{"text":"$4,850","kind":"money"}],"total":{"text":"$11,100","kind":"money"}}]}

Example 3 (per-share):
Input: "Net Income $775\nWeighted Average Shares Outstanding (Basic) 52,100\nNet Income Per Share - Basic $0.015"
Output: {"relations":[{"id":"r1","type":"ratio","label":"basic earnings per share","source":"table","numerator":{"text":"$775","kind":"money"},"denominator":{"text":"52,100","kind":"number"},"result":{"text":"$0.015","kind":"money"}}]}

JSON shape:
{
  "relations": [
    {
      "id": "r1",
      "type": "sum",
      "label": "departmental expenditure breakdown",
      "source": "table",
      "parts": [{"text": "$85,000", "kind": "money"}],
      "total": {"text": "$150,000", "kind": "money"}
    }
  ]
}

If no relation is explicitly stated, return {"relations": []}.`;
}

export function validityPrompt(text, relations) {
  return `You check whether a document explicitly states each relation. You never verify arithmetic; you only check whether the document CLAIMS the relationship.

Document:
<document>
${text}
</document>

Relations extracted from the document:
${JSON.stringify(relations, null, 2)}

For each relation id, answer: does the document explicitly state this relation?
- sum: does it state these parts add up to this total? A table row labeled "Total X", "Total", "Subtotal", or "Combined" listed with its component rows IS an explicit statement of the sum. A sentence with "total", "combined", or "in total" states it.
- difference: does it state A minus B equals R? A derived table row (e.g., "Gross Profit" between Total Revenue and Total Cost of Revenue, "Operating Income" below Gross Profit and Total Operating Expenses) IS an explicit statement.
- percent-of: does it state X% of B is R? ("operating margin of roughly 6.1%" states it.)
- percent-change: does it state the change from A to B as P%? ("expanded by 15.4% year-over-year" states it.)
- ratio: does it state N divided by D equals R? (A "per share" row together with the income and shares rows states it.)
- comparison: does it state A is double/triple/etc. of B?
In prose, merely listing numbers near each other does NOT count — the wording must claim the relationship. In tables, row labels, subtotal rows, and derived rows DO count.

Return ONLY strict JSON, no commentary:
{"stated": [{"id": "r1", "stated": true}]}`;
}
