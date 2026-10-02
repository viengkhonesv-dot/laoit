// Claude API: research ໄອເດຍດ້ວຍ web search ແລະ ສ້າງຄອນເທັນ carousel / video
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
// On a safety decline the API re-runs the request on Anthropic's recommended fallback model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

export class AiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

let client;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new AiError("ຍັງບໍ່ໄດ້ຕັ້ງ ANTHROPIC_API_KEY — ກະລຸນາເພີ່ມໃນໄຟລ໌ .env ຫຼື environment", 500);
  }
  client ??= new Anthropic();
  return client;
}

function checkStop(message) {
  if (message.stop_reason === "refusal") {
    throw new AiError("Claude ປະຕິເສດຄຳຂໍນີ້ — ລອງປັບຫົວຂໍ້ ຫຼື ຄຳອະທິບາຍໃໝ່", 422);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiError("ຜົນລັບຍາວເກີນກຳນົດ — ລອງຫຼຸດຈຳນວນສະໄລ້/ໄອເດຍລົງ", 502);
  }
}

// ---------- Context ----------

const CONTEXT_LABELS = {
  brandName: "ຊື່ແບຣນ / ສູນຝຶກອົບຮົມ",
  about: "ກ່ຽວກັບບໍລິການ",
  courses: "ຫຼັກສູດທີ່ມີ",
  audience: "ກຸ່ມເປົ້າໝາຍ",
  tone: "ນ້ຳສຽງ / ສະໄຕລ໌ການສື່ສານ",
  contentPillars: "ເສົາຫຼັກຄອນເທັນ (content pillars)",
  dos: "ສິ່ງທີ່ຄວນເຮັດ",
  donts: "ສິ່ງທີ່ຫ້າມເຮັດ",
  cta: "Call to action ຫຼັກ",
  hashtags: "Hashtag ປະຈຳ",
  references: "ເອກະສານອ້າງອີງເພີ່ມເຕີມ",
};

export function formatContext(ctx) {
  const parts = Object.entries(CONTEXT_LABELS)
    .filter(([key]) => ctx[key]?.trim())
    .map(([key, label]) => `## ${label}\n${ctx[key].trim()}`);
  return parts.length ? parts.join("\n\n") : "(ຍັງບໍ່ໄດ້ກຳນົດ context — ໃຊ້ຫຼັກການທົ່ວໄປຂອງສູນຝຶກອົບຮົມໄອທີໃນລາວ)";
}

function systemPrompt(ctx) {
  return `ເຈົ້າແມ່ນ content strategist ແລະ copywriter ຂອງບໍລິການຝຶກອົບຮົມຫຼັກສູດໄອທີໃນ ສປປ ລາວ.
ຂຽນເປັນພາສາລາວທີ່ເປັນທຳມະຊາດ ອ່ານງ່າຍ ເໝາະກັບ social media; ຄຳສັບເຕັກນິກໃຫ້ໃຊ້ພາສາອັງກິດຕາມທີ່ວົງການໃຊ້ຈິງ (ເຊັ່ນ Python, Cloud, AI).
ຫ້າມສ້າງຕົວເລກ ຫຼື ຂໍ້ເທັດຈິງຂຶ້ນເອງ — ໃຊ້ສະເພາະຂໍ້ມູນທີ່ມີແຫຼ່ງອ້າງອີງ ແລະ ຖ້າບໍ່ແນ່ໃຈໃຫ້ຂຽນແບບບໍ່ອ້າງຕົວເລກ.
ປະຕິບັດຕາມ context ແລະ ແນວທາງຄອນເທັນຂອງແບຣນລຸ່ມນີ້ຢ່າງເຄັ່ງຄັດ.

# Context ຂອງແບຣນ
${formatContext(ctx)}`;
}

// ---------- 1. Research ideas ----------

const IdeasSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string().describe("ຫົວຂໍ້ໄອເດຍ ພາສາລາວ"),
      hook: z.string().describe("ປະໂຫຍກເປີດທີ່ດຶງຄວາມສົນໃຈ"),
      angle: z.string().describe("ມຸມມອງ / ວິທີເລົ່າທີ່ເຊື່ອມກັບຫຼັກສູດຂອງແບຣນ"),
      whyNow: z.string().describe("ເປັນຫຍັງຄົນສົນໃຈເລື່ອງນີ້ຕອນນີ້ (trend signal)"),
      audienceFit: z.string().describe("ເໝາະກັບກຸ່ມເປົ້າໝາຍໃດ ແລະ ເປັນຫຍັງ"),
      pillar: z.string().describe("content pillar ທີ່ກົງກັນ"),
      suggestedFormat: z.enum(["carousel", "video", "both"]),
      keyFacts: z.array(
        z.object({
          fact: z.string().describe("ຂໍ້ເທັດຈິງ/ຕົວເລກ ແປເປັນພາສາລາວ"),
          sourceTitle: z.string(),
          sourceUrl: z.string().describe("URL ທີ່ຕ້ອງມາຈາກລາຍການແຫຼ່ງທີ່ໃຫ້ໄວ້ເທົ່ານັ້ນ"),
          publisher: z.string().describe("ອົງກອນ/ສຳນັກຂ່າວທີ່ເຜີຍແຜ່"),
          publishedDate: z.string().describe("ວັນທີເຜີຍແຜ່ ຖ້າຮູ້, ຖ້າບໍ່ຮູ້ໃຫ້ເປັນ string ຫວ່າງ"),
        }),
      ),
    }),
  ),
});

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

// Collect every URL the search actually returned, so facts can be checked against real results.
export function collectSources(content) {
  const sources = new Map();
  const add = (url, title, pageAge) => {
    if (!url) return;
    const key = normalizeUrl(url);
    if (!sources.has(key)) sources.set(key, { url, title: title || url, pageAge: pageAge || "" });
  };
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) add(r.url, r.title, r.page_age);
    }
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) add(c.url, c.title);
    }
  }
  return sources;
}

export async function researchIdeas(ctx, { focus = "", count = 5 } = {}) {
  const anthropic = getClient();
  const today = new Date().toISOString().slice(0, 10);
  const n = Math.min(Math.max(Number(count) || 5, 1), 10);

  const messages = [
    {
      role: "user",
      content: `ວັນນີ້ແມ່ນ ${today}.
ຄົ້ນຫາເລື່ອງທີ່ຄົນກຳລັງສົນໃຈ (trending) ກ່ຽວກັບໄອທີ, ທັກສະດິຈິຕອນ, ອາຊີບ ແລະ ຕະຫຼາດແຮງງານໄອທີ ທີ່ກ່ຽວຂ້ອງກັບກຸ່ມເປົ້າໝາຍຂອງເຮົາ (ລາວ / ອາຊີຕາເວັນອອກສ່ຽງໃຕ້ / ທົ່ວໂລກ).
${focus ? `ຫົວຂໍ້ທີ່ຢາກເນັ້ນ: ${focus}\n` : ""}
ສິ່ງທີ່ຕ້ອງເຮັດ:
1. ໃຊ້ web search ຫຼາຍຄັ້ງເພື່ອຊອກ trend ລ່າສຸດ (ພາຍໃນ 6 ເດືອນ) ແລະ ຂໍ້ມູນຈິງທີ່ຢືນຢັນໄດ້.
2. ໃຊ້ແຫຼ່ງທີ່ໜ້າເຊື່ອຖືເທົ່ານັ້ນ: ໜ່ວຍງານລັດ, ອົງການສາກົນ (World Bank, ITU, WEF, UNESCO), ບໍລິສັດຄົ້ນຄວ້າ (Gartner, IDC, McKinsey), survey ທີ່ຮູ້ຈັກ (Stack Overflow, GitHub Octoverse), ເອກະສານທາງການຂອງຜູ້ຜະລິດ (Google, Microsoft, AWS) ແລະ ສຳນັກຂ່າວຫຼັກ. ຫຼີກລ່ຽງ blog ທີ່ບໍ່ມີທີ່ມາ ແລະ content farm.
3. ສະຫຼຸບ ${n} ໄອເດຍຄອນເທັນ ທີ່ເຊື່ອມໂຍງກັບຫຼັກສູດຂອງເຮົາໄດ້. ແຕ່ລະໄອເດຍໃຫ້ມີຂໍ້ເທັດຈິງ 2-4 ຂໍ້ ພ້ອມ URL ແຫຼ່ງທີ່ມາ ແລະ ວັນທີ.`,
    },
  ];

  let message;
  let allContent = [];
  for (let turn = 0; turn < 6; turn++) {
    message = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: systemPrompt(ctx),
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
      ...FALLBACK,
    });
    allContent = allContent.concat(message.content);
    if (message.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: message.content });
  }
  checkStop(message);

  const sources = collectSources(allContent);
  if (sources.size === 0) {
    throw new AiError("Web search ບໍ່ພົບແຫຼ່ງຂໍ້ມູນ — ລອງໃໝ່ອີກຄັ້ງ ຫຼື ປ່ຽນຫົວຂໍ້", 502);
  }
  const notes = allContent
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const sourceList = [...sources.values()]
    .map((s, i) => `${i + 1}. ${s.title} — ${s.url}${s.pageAge ? ` (${s.pageAge})` : ""}`)
    .join("\n");

  // Second pass: turn research notes into structured ideas. Structured outputs can't be combined
  // with the search citations, so this call only sees the notes and the list of real URLs.
  const parsed = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(ctx),
    output_config: { effort: "medium", format: betaZodOutputFormat(IdeasSchema) },
    messages: [
      {
        role: "user",
        content: `ຈາກບັນທຶກການຄົ້ນຄວ້າ ແລະ ລາຍການແຫຼ່ງລຸ່ມນີ້, ຈັດເປັນ ${n} ໄອເດຍຄອນເທັນ.
ກົດ: sourceUrl ຂອງທຸກ keyFact ຕ້ອງເປັນ URL ຈາກ "ລາຍການແຫຼ່ງ" ເທົ່ານັ້ນ; ຖ້າຂໍ້ເທັດຈິງໃດບໍ່ມີແຫຼ່ງ ໃຫ້ຕັດອອກ.

# ບັນທຶກການຄົ້ນຄວ້າ
${notes}

# ລາຍການແຫຼ່ງ (ຜົນຈາກ web search)
${sourceList}`,
      },
    ],
    ...FALLBACK,
  });
  checkStop(parsed);
  if (!parsed.parsed_output) throw new AiError("ອ່ານຜົນລັບຈາກ Claude ບໍ່ໄດ້ — ລອງໃໝ່", 502);

  return parsed.parsed_output.ideas.map((idea) => ({
    ...idea,
    focus,
    keyFacts: idea.keyFacts.map((f) => ({ ...f, verified: sources.has(normalizeUrl(f.sourceUrl)) })),
    sources: [...sources.values()],
  }));
}

// ---------- 2. Content generation ----------

const CarouselSchema = z.object({
  title: z.string().describe("ຫົວຂໍ້ carousel"),
  caption: z.string().describe("caption ສຳລັບໂພສ ພາສາລາວ"),
  hashtags: z.array(z.string()),
  slides: z.array(
    z.object({
      number: z.number(),
      role: z.enum(["cover", "content", "summary", "cta"]),
      headline: z.string().describe("ຫົວຂໍ້ສະໄລ້ ສັ້ນ ບໍ່ເກີນ 8 ຄຳ"),
      body: z.string().describe("ເນື້ອຫາສະໄລ້ ບໍ່ເກີນ 40 ຄຳ"),
      visualDescription: z.string().describe("ອະທິບາຍພາບ/layout ເປັນພາສາລາວ ສຳລັບຜູ້ອະນຸມັດ"),
      flowPrompt: z
        .string()
        .describe("English image prompt for Google Flow, 4:5 portrait, leave clear negative space for text overlay, no rendered text"),
      sourceUrl: z.string().describe("URL ແຫຼ່ງຂອງຂໍ້ມູນໃນສະໄລ້ນີ້ ຫຼື string ຫວ່າງ"),
    }),
  ),
});

const VideoSchema = z.object({
  title: z.string(),
  hook: z.string().describe("3 ວິນາທີທຳອິດ"),
  caption: z.string(),
  hashtags: z.array(z.string()),
  scenes: z.array(
    z.object({
      number: z.number(),
      durationSeconds: z.number().describe("ຄວາມຍາວ scene ປົກກະຕິ 8 ວິນາທີ (ຂີດຈຳກັດຂອງ Veo ໃນ Flow)"),
      visual: z.string().describe("ອະທິບາຍພາບເປັນພາສາລາວ"),
      voiceover: z.string().describe("ບົດພາກ ພາສາລາວ"),
      onScreenText: z.string().describe("ຂໍ້ຄວາມເທິງຈໍ ພາສາລາວ"),
      flowPrompt: z
        .string()
        .describe("English Veo video prompt for Google Flow: subject, action, camera, lighting, style; 9:16 vertical; no rendered text"),
      sourceUrl: z.string(),
    }),
  ),
});

export const SCHEMAS = { carousel: CarouselSchema, video: VideoSchema };

function ideaBrief(idea) {
  const facts = (idea.keyFacts || [])
    .map((f) => `- ${f.fact} (ແຫຼ່ງ: ${f.publisher || f.sourceTitle}, ${f.sourceUrl}${f.publishedDate ? `, ${f.publishedDate}` : ""})`)
    .join("\n");
  return `# ໄອເດຍ
ຫົວຂໍ້: ${idea.title}
Hook: ${idea.hook || ""}
ມຸມມອງ: ${idea.angle || ""}
ເປັນຫຍັງຕອນນີ້: ${idea.whyNow || ""}
ກຸ່ມເປົ້າໝາຍ: ${idea.audienceFit || ""}

# ຂໍ້ເທັດຈິງທີ່ອະນຸຍາດໃຫ້ໃຊ້ (ພ້ອມແຫຼ່ງ)
${facts || "- (ບໍ່ມີ — ຫ້າມໃຊ້ຕົວເລກ)"}`;
}

function formatInstructions(type, options) {
  if (type === "carousel") {
    const n = Math.min(Math.max(Number(options.slides) || 7, 3), 12);
    return `ສ້າງ carousel ${n} ສະໄລ້ ສຳລັບ Facebook / Instagram / LinkedIn:
- ສະໄລ້ 1 = cover ທີ່ມີ hook ແຮງ ເຮັດໃຫ້ຢາກປັດຕໍ່
- ສະໄລ້ກາງ = 1 ແນວຄິດຕໍ່ 1 ສະໄລ້, ໃຊ້ຂໍ້ເທັດຈິງພ້ອມອ້າງແຫຼ່ງ (ໃສ່ sourceUrl)
- ສະໄລ້ກ່ອນສຸດທ້າຍ = ສະຫຼຸບ, ສະໄລ້ສຸດທ້າຍ = CTA ເຊື່ອມກັບຫຼັກສູດຂອງເຮົາ
- flowPrompt ເປັນພາສາອັງກິດ ສຳລັບສ້າງພາບໃນ Google Flow; ຮັກສາສະໄຕລ໌ພາບໃຫ້ຄືກັນທຸກສະໄລ້ (ສີ, ແສງ, ລັກສະນະ illustration); ບໍ່ໃຫ້ມີຕົວອັກສອນໃນພາບ ເພາະຈະວາງຂໍ້ຄວາມພາສາລາວທີຫຼັງ`;
  }
  const secs = Math.min(Math.max(Number(options.duration) || 40, 15), 90);
  return `ສ້າງ script ວິດີໂອສັ້ນແນວຕັ້ງ (Reels / TikTok / Shorts) ຍາວປະມານ ${secs} ວິນາທີ:
- ແບ່ງເປັນ scene ລະປະມານ 8 ວິນາທີ (ຂີດຈຳກັດຂອງ Veo ໃນ Google Flow)
- scene 1 ຕ້ອງມີ hook ພາຍໃນ 3 ວິນາທີ
- ບົດພາກເປັນພາສາລາວ ເວົ້າງ່າຍ ເປັນກັນເອງ, ຂໍ້ເທັດຈິງຕ້ອງມີແຫຼ່ງ (ໃສ່ sourceUrl)
- scene ສຸດທ້າຍ = CTA ເຊື່ອມກັບຫຼັກສູດ
- flowPrompt ເປັນພາສາອັງກິດ ອະທິບາຍ subject, action, camera movement, lighting, style ໃຫ້ຕໍ່ເນື່ອງກັນທຸກ scene; ບໍ່ໃຫ້ມີຕົວອັກສອນໃນພາບ`;
}

async function generateStructured(ctx, type, userContent) {
  const anthropic = getClient();
  const parsed = await anthropic.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt(ctx),
    output_config: { effort: "medium", format: betaZodOutputFormat(SCHEMAS[type]) },
    messages: [{ role: "user", content: userContent }],
    ...FALLBACK,
  });
  checkStop(parsed);
  if (!parsed.parsed_output) throw new AiError("ອ່ານຜົນລັບຈາກ Claude ບໍ່ໄດ້ — ລອງໃໝ່", 502);
  return parsed.parsed_output;
}

export function generateContent(ctx, idea, type, options = {}) {
  if (!SCHEMAS[type]) throw new AiError(`ບໍ່ຮູ້ຈັກຮູບແບບ ${type}`, 400);
  return generateStructured(
    ctx,
    type,
    `${ideaBrief(idea)}

# ວຽກ
${formatInstructions(type, options)}
${options.notes ? `\n# ຄຳແນະນຳເພີ່ມເຕີມ\n${options.notes}` : ""}`,
  );
}

export function reviseContent(ctx, content, feedback) {
  return generateStructured(
    ctx,
    content.type,
    `ປັບປຸງຄອນເທັນ ${content.type} ລຸ່ມນີ້ຕາມຄຳຄິດເຫັນຂອງຜູ້ອະນຸມັດ. ຮັກສາສ່ວນທີ່ບໍ່ໄດ້ຖືກຕິຕຽນໄວ້ຄືເກົ່າ.

# ຄຳຄິດເຫັນ
${feedback}

${content.idea ? ideaBrief(content.idea) : ""}

# ຄອນເທັນປັດຈຸບັນ (JSON)
${JSON.stringify(content.data, null, 2)}`,
  );
}
