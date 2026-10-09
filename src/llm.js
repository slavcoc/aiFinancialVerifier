// Provider-agnostic JSON generation. Picks the API by model name:
// anything with "claude" → Anthropic, otherwise Gemini.

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

function providerFor(model) {
  return /claude/i.test(model) ? "anthropic" : "gemini";
}

function stripFences(raw) {
  let s = String(raw).trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return s;
}

export async function generateJson(config, { system, prompt }) {
  const provider = providerFor(config.model);

  if (provider === "anthropic") {
    if (!config.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set (add it to .env)");
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const msg = await client.messages.create({
      model: config.model,
      max_tokens: 16384,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return stripFences(text);
  }

  if (!config.geminiApiKey) throw new Error("GEMINI_API_KEY not set (add it to .env)");
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const response = await ai.models.generateContent({
    model: config.model,
    contents: prompt,
    config: {
      systemInstruction: system,
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: 16384,
    },
  });
  return stripFences(response.text);
}
