import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { collectSources, SCHEMAS } from "../lib/ai.js";
import { buildFlowPackage } from "../lib/flow.js";

const carousel = {
  title: "5 ທັກສະ AI ທີ່ນາຍຈ້າງຕ້ອງການ",
  caption: "caption",
  hashtags: ["#LaoIT"],
  slides: [
    { number: 1, role: "cover", headline: "Hook", body: "body", visualDescription: "v", flowPrompt: "A laptop on a desk", sourceUrl: "" },
    { number: 2, role: "cta", headline: "CTA", body: "ລົງທະບຽນ", visualDescription: "v", flowPrompt: "Students smiling", sourceUrl: "" },
  ],
};

test("schemas convert to structured-output formats", () => {
  for (const schema of Object.values(SCHEMAS)) assert.ok(betaZodOutputFormat(schema).schema);
  assert.ok(SCHEMAS.carousel.safeParse(carousel).success);
});

test("collectSources gathers search results and citations, deduplicated", () => {
  const sources = collectSources([
    { type: "web_search_tool_result", content: [{ url: "https://www.weforum.org/report/", title: "WEF", page_age: "2026" }] },
    { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
    { type: "text", text: "x", citations: [{ url: "https://weforum.org/report", title: "WEF" }, { url: "https://idc.com/a", title: "IDC" }] },
  ]);
  assert.equal(sources.size, 2);
});

test("buildFlowPackage produces one prompt per slide", () => {
  const pkg = buildFlowPackage({ type: "carousel", data: carousel });
  assert.equal(pkg.prompts.length, 2);
  assert.match(pkg.text, /Students smiling/);
  assert.equal(pkg.flowUrl, "https://flow.google.com/");
});

let dir, server, base;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "laoit-"));
  const db = path.join(dir, "db.json");
  const idea = { id: "idea-1", createdAt: "2026-01-01T00:00:00Z", title: "AI", keyFacts: [] };
  const content = {
    id: "c1", type: "carousel", status: "draft", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    history: [], idea, data: carousel,
  };
  await writeFile(db, JSON.stringify({ context: {}, ideas: [idea], contents: [content] }));
  const port = 3900 + Math.floor(Math.random() * 90);
  base = `http://localhost:${port}/api`;
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: port, DATA_FILE: db, ANTHROPIC_API_KEY: "" }, stdio: "pipe" });
  await new Promise((resolve) => server.stdout.on("data", resolve));
});
after(async () => {
  server.kill();
  await rm(dir, { recursive: true, force: true });
});

const call = async (p, method = "GET", body) => {
  const res = await fetch(base + p, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

test("approval workflow gates the Google Flow hand-off", async () => {
  assert.equal((await call("/contents/c1/flow")).status, 409);
  assert.equal((await call("/contents/c1/approve", "POST", {})).status, 409);
  assert.equal((await call("/contents/c1/submit", "POST", {})).body.status, "pending_approval");
  assert.equal((await call("/contents/c1/request_changes", "POST", {})).status, 400);
  assert.equal((await call("/contents/c1/request_changes", "POST", { note: "hook ອ່ອນ" })).body.lastFeedback, "hook ອ່ອນ");
  await call("/contents/c1/submit", "POST", {});
  const approved = await call("/contents/c1/approve", "POST", { by: "ສົມພອນ" });
  assert.equal(approved.body.approvedBy, "ສົມພອນ");
  assert.equal((await call("/contents/c1/flow")).body.prompts.length, 2);
  assert.equal((await call("/contents/c1/send_to_flow", "POST", {})).body.status, "sent_to_flow");
  assert.equal((await call("/contents/c1/bogus", "POST", {})).status, 404);
});

test("edits are validated and context persists", async () => {
  assert.equal((await call("/contents/c1", "PUT", { data: { title: 1 } })).status, 400);
  const edited = await call("/contents/c1", "PUT", { data: { ...carousel, title: "ໃໝ່" } });
  assert.equal(edited.body.status, "draft"); // editing approved content sends it back for re-approval
  assert.equal((await call("/context", "PUT", { brandName: "LaoIT", evil: "x" })).body.brandName, "LaoIT");
  assert.equal((await call("/context")).body.evil, undefined);
});

test("AI endpoints report a missing API key clearly", async () => {
  const res = await call("/contents/generate", "POST", { ideaId: "idea-1", type: "carousel" });
  assert.equal(res.status, 500);
  assert.match(res.body.error, /ANTHROPIC_API_KEY/);
});
