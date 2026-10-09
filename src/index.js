import express from "express";
import { config } from "./config.js";
import { checkText } from "./pipeline.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

// CORS for the future static UI (verifier-tool/index.html)
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// request logging — every /check logs its result counts
app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/check") {
    const start = Date.now();
    const orig = res.json.bind(res);
    res.json = (body) => {
      const ms = Date.now() - start;
      const s = body?.summary;
      console.log(
        `[check] ${ms}ms` +
          (s
            ? ` | checked=${s.checked} passed=${s.passed} failed=${s.failed} discarded=${s.discarded?.total ?? 0}`
            : "") +
          (body?.ok === false ? ` | error=${body?.error ?? ""}` : "")
      );
      return orig(body);
    };
  }
  next();
});

app.get("/health", (req, res) => {
  res.json({ ok: true, mock: config.mock, model: config.model, validityPass: config.validityPass, version: config.version });
});

app.post("/check", async (req, res) => {
  try {
    const text = req.body?.text;
    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ ok: false, error: "body.text must be a non-empty string" });
    }
    if (text.length > config.maxInputChars) {
      return res
        .status(413)
        .json({ ok: false, error: `text exceeds limit of ${config.maxInputChars} chars` });
    }
    const result = await checkText(text, config);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[second-reader] /check failed:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(config.port, () => {
  console.log(
    `[second-reader] listening on :${config.port} — mock=${config.mock}, model=${config.model}, validity=${config.validityPass}`
  );
});
