import "dotenv/config";

const env = process.env;

export const config = {
  version: "0.4.2",
  geminiApiKey: env.GEMINI_API_KEY || "",
  anthropicApiKey: env.ANTHROPIC_API_KEY || "",
  model: env.MODEL || env.GEMINI_MODEL || "gemini-3.8-flash",
  validityPass: (env.VALIDITY_PASS ?? "on").toLowerCase() !== "off",
  mock: env.GEMINI_MOCK === "1",
  port: Number(env.PORT || 8787),
  maxInputChars: Number(env.MAX_INPUT_CHARS || 100000),
};
