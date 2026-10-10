import { describe, expect, it } from "vitest";
import { normalizePastedText } from "./text";

describe("normalizePastedText", () => {
  it("restores line breaks from zero-width spaces", () => {
    const pasted =
      "Income\u200B$6,500\u200BRegulatory Reference & Audit Links\u200BWorking Links (Functional):";
    expect(normalizePastedText(pasted)).toBe(
      "Income\n$6,500\nRegulatory Reference & Audit Links\nWorking Links (Functional):"
    );
  });

  it("keeps URLs from swallowing the following text", () => {
    const pasted =
      "Portal: https://www.sec.gov/edgar/search/\u200BSEC EDGAR Company\u200Bhttps://www.sec.gov/x\u200BBroken Links";
    expect(normalizePastedText(pasted)).toBe(
      "Portal: https://www.sec.gov/edgar/search/\nSEC EDGAR Company\nhttps://www.sec.gov/x\nBroken Links"
    );
  });

  it("removes word joiners and soft hyphens", () => {
    expect(normalizePastedText("co\u00ADoperate\u2060well")).toBe("cooperatewell");
  });

  it("leaves ordinary text untouched", () => {
    const normal = "Total reached $150,000.\n\n- Personnel: $85,000\n- Travel: $25,000";
    expect(normalizePastedText(normal)).toBe(normal);
  });

  it("treats a zero-width no-break space (BOM) as a line separator", () => {
    expect(normalizePastedText("a\uFEFFb")).toBe("a\nb");
  });
});
