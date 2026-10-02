import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./lib/store.js";
import { AiError, researchIdeas, generateContent, reviseContent, SCHEMAS } from "./lib/ai.js";
import { buildFlowPackage } from "./lib/flow.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // .env is optional; environment variables may be set directly.
}

const store = await new Store(process.env.DATA_FILE || path.join(__dirname, "data", "db.json")).load();
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

// Workflow: draft → pending_approval → approved → sent_to_flow
//                         ↘ changes_requested → (revise/edit) → pending_approval
const TRANSITIONS = {
  submit: { from: ["draft", "changes_requested"], to: "pending_approval" },
  approve: { from: ["pending_approval"], to: "approved" },
  request_changes: { from: ["pending_approval", "approved"], to: "changes_requested" },
  send_to_flow: { from: ["approved", "sent_to_flow"], to: "sent_to_flow" },
};

const notFound = (res, what = "ລາຍການ") => res.status(404).json({ error: `ບໍ່ພົບ${what}` });

// ---------- Context ----------
app.get("/api/context", (req, res) => res.json(store.getContext()));
app.put("/api/context", async (req, res) => res.json(await store.setContext(req.body || {})));

// ---------- Ideas ----------
app.get("/api/ideas", (req, res) => res.json(store.listIdeas()));

app.post("/api/ideas/research", async (req, res) => {
  const { focus = "", count = 5 } = req.body || {};
  const ideas = await researchIdeas(store.getContext(), { focus: String(focus).slice(0, 500), count });
  res.json(await store.addIdeas(ideas));
});

app.post("/api/ideas", async (req, res) => {
  const { title, angle = "", hook = "" } = req.body || {};
  if (!title?.trim()) return res.status(400).json({ error: "ກະລຸນາໃສ່ຫົວຂໍ້" });
  const [idea] = await store.addIdeas([
    { title: title.trim(), angle, hook, whyNow: "", audienceFit: "", pillar: "", suggestedFormat: "both", keyFacts: [], sources: [], manual: true },
  ]);
  res.json(idea);
});

app.patch("/api/ideas/:id", async (req, res) => {
  const allowed = ["title", "hook", "angle", "status"];
  const patch = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  const idea = await store.updateIdea(req.params.id, patch);
  return idea ? res.json(idea) : notFound(res, "ໄອເດຍ");
});

app.delete("/api/ideas/:id", async (req, res) =>
  (await store.deleteIdea(req.params.id)) ? res.json({ ok: true }) : notFound(res, "ໄອເດຍ"),
);

// ---------- Contents ----------
app.get("/api/contents", (req, res) => res.json(store.listContents()));

app.get("/api/contents/:id", (req, res) => {
  const content = store.getContent(req.params.id);
  return content ? res.json(content) : notFound(res, "ຄອນເທັນ");
});

app.post("/api/contents/generate", async (req, res) => {
  const { ideaId, type, options = {} } = req.body || {};
  if (!SCHEMAS[type]) return res.status(400).json({ error: "type ຕ້ອງເປັນ carousel ຫຼື video" });
  const idea = store.getIdea(ideaId);
  if (!idea) return notFound(res, "ໄອເດຍ");
  const data = await generateContent(store.getContext(), idea, type, options);
  await store.updateIdea(idea.id, { status: "used" });
  const { sources, ...ideaSnapshot } = idea;
  res.json(await store.addContent({ type, ideaId: idea.id, idea: ideaSnapshot, options, data }));
});

// Manual edits by the content team (only while not yet approved).
app.put("/api/contents/:id", async (req, res) => {
  const content = store.getContent(req.params.id);
  if (!content) return notFound(res, "ຄອນເທັນ");
  const parsed = SCHEMAS[content.type].safeParse(req.body?.data);
  if (!parsed.success) return res.status(400).json({ error: "ຂໍ້ມູນບໍ່ຖືກຮູບແບບ", details: parsed.error.issues });
  const status = ["approved", "sent_to_flow"].includes(content.status) ? "draft" : content.status;
  res.json(await store.updateContent(content.id, { data: parsed.data, status }, { action: "edited" }));
});

app.post("/api/contents/:id/revise", async (req, res) => {
  const content = store.getContent(req.params.id);
  if (!content) return notFound(res, "ຄອນເທັນ");
  const feedback = String(req.body?.feedback || content.lastFeedback || "").trim();
  if (!feedback) return res.status(400).json({ error: "ກະລຸນາໃສ່ຄຳຄິດເຫັນສຳລັບການປັບປຸງ" });
  const data = await reviseContent(store.getContext(), content, feedback);
  res.json(await store.updateContent(content.id, { data, status: "draft" }, { action: "revised_by_ai", note: feedback }));
});

app.post("/api/contents/:id/:action", async (req, res) => {
  const rule = Object.hasOwn(TRANSITIONS, req.params.action) && TRANSITIONS[req.params.action];
  if (!rule) return res.status(404).json({ error: "ບໍ່ຮູ້ຈັກຄຳສັ່ງນີ້" });
  const content = store.getContent(req.params.id);
  if (!content) return notFound(res, "ຄອນເທັນ");
  if (!rule.from.includes(content.status)) {
    return res.status(409).json({ error: `ບໍ່ສາມາດ ${req.params.action} ຈາກສະຖານະ ${content.status}` });
  }
  const note = String(req.body?.note || "").trim();
  const by = String(req.body?.by || "").trim();
  if (req.params.action === "request_changes" && !note) {
    return res.status(400).json({ error: "ກະລຸນາບອກສິ່ງທີ່ຕ້ອງແກ້ໄຂ" });
  }
  const patch = { status: rule.to };
  if (req.params.action === "request_changes") patch.lastFeedback = note;
  if (req.params.action === "approve") Object.assign(patch, { approvedAt: new Date().toISOString(), approvedBy: by });
  if (req.params.action === "send_to_flow") patch.sentToFlowAt = new Date().toISOString();
  res.json(await store.updateContent(content.id, patch, { action: req.params.action, note, by }));
});

app.get("/api/contents/:id/flow", (req, res) => {
  const content = store.getContent(req.params.id);
  if (!content) return notFound(res, "ຄອນເທັນ");
  if (!["approved", "sent_to_flow"].includes(content.status)) {
    return res.status(409).json({ error: "ຕ້ອງອະນຸມັດກ່ອນຈຶ່ງສົ່ງໄປ Google Flow ໄດ້" });
  }
  res.json(buildFlowPackage(content));
});

app.delete("/api/contents/:id", async (req, res) =>
  (await store.deleteContent(req.params.id)) ? res.json({ ok: true }) : notFound(res, "ຄອນເທັນ"),
);

// Express 5 forwards rejected promises from async handlers here.
app.use((err, req, res, next) => {
  if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  if (err instanceof Anthropic.AuthenticationError) {
    return res.status(500).json({ error: "API key ບໍ່ຖືກຕ້ອງ — ກວດ ANTHROPIC_API_KEY" });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return res.status(429).json({ error: "ເອີ້ນ Claude API ຖີ່ເກີນໄປ — ລໍຖ້າຈັກໜ່ອຍແລ້ວລອງໃໝ່" });
  }
  if (err instanceof Anthropic.APIError) {
    return res.status(502).json({ error: `Claude API: ${err.message}` });
  }
  res.status(err.status || 500).json({ error: err.message || "ເກີດຂໍ້ຜິດພາດ" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Content Library ເປີດຢູ່ http://localhost:${port}`));
