const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const STATUS = {
  draft: "ຮ່າງ",
  pending_approval: "ລໍຖ້າອະນຸມັດ",
  changes_requested: "ຕ້ອງແກ້ໄຂ",
  approved: "ອະນຸມັດແລ້ວ",
  sent_to_flow: "ສົ່ງ Flow ແລ້ວ",
};
const TYPE = { carousel: "Carousel", video: "Video" };
const FORMAT = { carousel: "Carousel", video: "Video", both: "Carousel / Video" };
const ACTION = {
  created: "ສ້າງ",
  edited: "ແກ້ໄຂ",
  revised_by_ai: "AI ປັບປຸງ",
  submit: "ສົ່ງອະນຸມັດ",
  approve: "ອະນຸມັດ",
  request_changes: "ຂໍໃຫ້ແກ້ໄຂ",
  send_to_flow: "ສົ່ງ Google Flow",
};
const EDITABLE = ["draft", "changes_requested"];

const state = { ideas: [], contents: [], current: null };

// ---------- helpers ----------
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function safeUrl(url) {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol) ? u.href : "#";
  } catch {
    return "#";
  }
}

const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString("lo-LA", { dateStyle: "medium", timeStyle: "short" }) : "");

function toast(msg, kind = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.className = "toast"), 3500);
}

async function busy(text, fn) {
  $("#busy-text").textContent = text;
  $("#busy").classList.remove("hidden");
  try {
    return await fn();
  } finally {
    $("#busy").classList.add("hidden");
  }
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function run(text, fn, okMsg) {
  try {
    const result = await busy(text, fn);
    if (okMsg) toast(okMsg, "ok");
    return result;
  } catch (err) {
    toast(err.message, "err");
    return null;
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("ສຳເນົາແລ້ວ ✓", "ok");
  } catch {
    toast("ສຳເນົາບໍ່ໄດ້ — ກະລຸນາເລືອກ ແລະ copy ເອງ", "err");
  }
}

function download(name, text, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- tabs ----------
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${name}`));
  try {
    localStorage.setItem("tab", name);
  } catch {}
}
$$(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

// ---------- 1. Context ----------
async function loadContext() {
  const ctx = await api("/context");
  for (const el of $("#context-form").elements) if (el.name && ctx[el.name] != null) el.value = ctx[el.name];
  $("#context-saved").textContent = ctx.updatedAt ? `ບັນທຶກລ່າສຸດ: ${fmtDate(ctx.updatedAt)}` : "";
}

$("#context-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const ctx = await run("ກຳລັງບັນທຶກ...", () => api("/context", { method: "PUT", body }), "ບັນທຶກ Context ແລ້ວ");
  if (ctx) $("#context-saved").textContent = `ບັນທຶກລ່າສຸດ: ${fmtDate(ctx.updatedAt)}`;
});

$("#context-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const form = $("#context-form");
  if (file.name.endsWith(".json")) {
    try {
      const obj = JSON.parse(text);
      for (const el of form.elements) if (el.name && typeof obj[el.name] === "string") el.value = obj[el.name];
      toast("ນຳເຂົ້າ JSON ແລ້ວ — ກົດບັນທຶກເພື່ອຢືນຢັນ", "ok");
    } catch {
      toast("ໄຟລ໌ JSON ບໍ່ຖືກຕ້ອງ", "err");
    }
  } else {
    const ref = form.elements.references;
    ref.value = [ref.value.trim(), `--- ${file.name} ---\n${text.trim()}`].filter(Boolean).join("\n\n");
    toast("ເພີ່ມເນື້ອຫາໄຟລ໌ເຂົ້າ 'ເອກະສານອ້າງອີງ' ແລ້ວ — ກົດບັນທຶກ", "ok");
  }
  e.target.value = "";
});

// ---------- 2. Ideas ----------
async function loadIdeas() {
  state.ideas = await api("/ideas");
  renderIdeas();
}

function renderIdeas() {
  const list = $("#ideas-list");
  if (!state.ideas.length) {
    list.innerHTML = `<p class="empty">ຍັງບໍ່ມີໄອເດຍ — ກົດ "ຄົ້ນຫາໄອເດຍ" ເພື່ອໃຫ້ AI ຫາ trend ແລະ ຂໍ້ມູນຈິງ.</p>`;
    return;
  }
  list.innerHTML = state.ideas
    .map(
      (idea) => `
    <article class="card idea ${idea.status === "used" ? "used" : ""}">
      <div class="card-top">
        <span class="tag">${esc(FORMAT[idea.suggestedFormat] || "")}</span>
        ${idea.pillar ? `<span class="tag soft">${esc(idea.pillar)}</span>` : ""}
        ${idea.status === "used" ? `<span class="tag ok">ໃຊ້ແລ້ວ</span>` : ""}
        <button class="icon-btn" data-del-idea="${idea.id}" title="ລຶບ">🗑</button>
      </div>
      <h3>${esc(idea.title)}</h3>
      ${idea.hook ? `<p class="hook">“${esc(idea.hook)}”</p>` : ""}
      ${idea.angle ? `<p><b>ມຸມມອງ:</b> ${esc(idea.angle)}</p>` : ""}
      ${idea.whyNow ? `<p><b>ເປັນຫຍັງຕອນນີ້:</b> ${esc(idea.whyNow)}</p>` : ""}
      ${idea.audienceFit ? `<p><b>ກຸ່ມເປົ້າໝາຍ:</b> ${esc(idea.audienceFit)}</p>` : ""}
      ${renderFacts(idea.keyFacts)}
      <div class="card-actions">
        <button class="btn" data-gen="carousel" data-idea="${idea.id}">🖼 ສ້າງ Carousel</button>
        <button class="btn" data-gen="video" data-idea="${idea.id}">🎬 ສ້າງ Video script</button>
      </div>
    </article>`,
    )
    .join("");
}

function renderFacts(facts = []) {
  if (!facts.length) return "";
  return `<div class="facts"><b>ຂໍ້ເທັດຈິງ & ແຫຼ່ງອ້າງອີງ</b><ul>${facts
    .map(
      (f) => `<li>
        ${esc(f.fact)}
        <a href="${esc(safeUrl(f.sourceUrl))}" target="_blank" rel="noopener noreferrer">${esc(f.publisher || host(f.sourceUrl))}${f.publishedDate ? ` · ${esc(f.publishedDate)}` : ""}</a>
        ${f.verified ? `<span class="verified" title="URL ນີ້ມາຈາກຜົນ web search ແທ້">✓ ກວດແລ້ວ</span>` : `<span class="unverified" title="URL ບໍ່ກົງກັບຜົນ search — ກວດເອງກ່ອນໃຊ້">⚠ ກວດເອງ</span>`}
      </li>`,
    )
    .join("")}</ul></div>`;
}

$("#research-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  const ideas = await run(
    "AI ກຳລັງຄົ້ນຫາ trend ແລະ ກວດຂໍ້ມູນຈາກແຫຼ່ງຕ່າງໆ... (ອາດໃຊ້ເວລາ 1-3 ນາທີ)",
    () => api("/ideas/research", { method: "POST", body }),
  );
  if (ideas) {
    toast(`ໄດ້ ${ideas.length} ໄອເດຍໃໝ່`, "ok");
    await loadIdeas();
  }
});

$("#manual-idea-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  if (await run("ກຳລັງເພີ່ມ...", () => api("/ideas", { method: "POST", body }), "ເພີ່ມໄອເດຍແລ້ວ")) {
    e.target.reset();
    await loadIdeas();
  }
});

$("#ideas-list").addEventListener("click", async (e) => {
  const del = e.target.closest("[data-del-idea]");
  if (del) {
    if (!confirm("ລຶບໄອເດຍນີ້?")) return;
    if (await run("ກຳລັງລຶບ...", () => api(`/ideas/${del.dataset.delIdea}`, { method: "DELETE" }))) await loadIdeas();
    return;
  }
  const gen = e.target.closest("[data-gen]");
  if (gen) openGenerate(gen.dataset.idea, gen.dataset.gen);
});

function openGenerate(ideaId, type) {
  const form = $("#generate-form");
  form.reset();
  form.elements.ideaId.value = ideaId;
  form.elements.type.value = type;
  $("#gen-title").textContent = type === "carousel" ? "ສ້າງ Carousel" : "ສ້າງ Video script";
  $("#gen-slides").classList.toggle("hidden", type !== "carousel");
  $("#gen-duration").classList.toggle("hidden", type !== "video");
  $("#generate-dialog").showModal();
}

$("#generate-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { ideaId, type, ...options } = Object.fromEntries(new FormData(e.target));
  $("#generate-dialog").close();
  const content = await run(
    type === "carousel" ? "AI ກຳລັງຄິດຫົວຂໍ້ ແລະ ຂຽນເນື້ອຫາແຕ່ລະສະໄລ້..." : "AI ກຳລັງຂຽນ script ແລະ ແບ່ງ scene...",
    () => api("/contents/generate", { method: "POST", body: { ideaId, type, options } }),
    "ສ້າງຮ່າງແລ້ວ — ກວດ ແລະ ສົ່ງອະນຸມັດໄດ້ເລີຍ",
  );
  if (content) {
    await Promise.all([loadIdeas(), loadContents()]);
    showTab("library");
    openContent(content.id);
  }
});

// ---------- 3. Library ----------
async function loadContents() {
  state.contents = await api("/contents");
  renderLibrary();
  renderApproval();
}

function contentCard(c) {
  const items = c.type === "carousel" ? c.data.slides : c.data.scenes;
  return `
    <article class="card content-card" data-open="${c.id}">
      <div class="card-top">
        <span class="tag">${TYPE[c.type]}</span>
        <span class="status s-${c.status}">${STATUS[c.status]}</span>
      </div>
      <h3>${esc(c.data.title)}</h3>
      <p class="muted">${items?.length || 0} ${c.type === "carousel" ? "ສະໄລ້" : "scene"} · ອັບເດດ ${esc(fmtDate(c.updatedAt))}</p>
      ${c.status === "changes_requested" && c.lastFeedback ? `<p class="feedback">💬 ${esc(c.lastFeedback)}</p>` : ""}
      ${c.type === "carousel" && items?.[0] ? `<div class="mini-slide"><b>${esc(items[0].headline)}</b><span>${esc(items[0].body)}</span></div>` : ""}
      ${c.type === "video" ? `<p class="hook">🎬 ${esc(c.data.hook)}</p>` : ""}
    </article>`;
}

function renderLibrary() {
  const q = $("#library-search").value.trim().toLowerCase();
  const type = $("#library-type").value;
  const status = $("#library-status").value;
  const list = state.contents.filter(
    (c) =>
      (!type || c.type === type) &&
      (!status || c.status === status) &&
      (!q || JSON.stringify(c.data).toLowerCase().includes(q)),
  );
  $("#library-list").innerHTML = list.length
    ? list.map(contentCard).join("")
    : `<p class="empty">ບໍ່ມີຄອນເທັນ — ໄປທີ່ແທັບ "ໄອເດຍ" ເພື່ອສ້າງ.</p>`;
}
["#library-search", "#library-type", "#library-status"].forEach((s) => $(s).addEventListener("input", renderLibrary));

// ---------- 4. Approval ----------
function renderApproval() {
  const pending = state.contents.filter((c) => c.status === "pending_approval");
  const pill = $("#pending-count");
  pill.textContent = pending.length;
  pill.classList.toggle("hidden", !pending.length);
  $("#approval-list").innerHTML = pending.length
    ? pending.map(contentCard).join("")
    : `<p class="empty">ບໍ່ມີຄອນເທັນລໍຖ້າອະນຸມັດ 🎉</p>`;
}

try {
  $("#approver-name").value = localStorage.getItem("approver") || "";
} catch {}
$("#approver-name").addEventListener("change", (e) => {
  try {
    localStorage.setItem("approver", e.target.value);
  } catch {}
});

[$("#library-list"), $("#approval-list")].forEach((el) =>
  el.addEventListener("click", (e) => {
    const card = e.target.closest("[data-open]");
    if (card) openContent(card.dataset.open);
  }),
);

// ---------- Content detail ----------
async function openContent(id) {
  const content = await run("ກຳລັງໂຫຼດ...", () => api(`/contents/${id}`));
  if (!content) return;
  state.current = content;
  renderContent();
  const dlg = $("#content-dialog");
  if (!dlg.open) dlg.showModal();
}

function field(path, value, { rows = 2, editable, cls = "" } = {}) {
  if (!editable) return `<div class="val ${cls}">${esc(value) || "<span class='muted'>—</span>"}</div>`;
  return rows === 1
    ? `<input class="${cls}" data-path="${path}" value="${esc(value)}">`
    : `<textarea class="${cls}" data-path="${path}" rows="${rows}">${esc(value)}</textarea>`;
}

function sourceLink(url) {
  return url ? `<a class="src" href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">📎 ${esc(host(url))}</a>` : "";
}

function renderCarousel(d, editable) {
  return `
    <div class="slides">
      ${d.slides
        .map(
          (s, i) => `
        <div class="slide-col">
          <div class="slide role-${s.role}">
            <span class="slide-no">${s.number}/${d.slides.length}</span>
            ${field(`slides.${i}.headline`, s.headline, { rows: 2, editable, cls: "headline" })}
            ${field(`slides.${i}.body`, s.body, { rows: 5, editable, cls: "body" })}
            ${sourceLink(s.sourceUrl)}
          </div>
          <details class="slide-meta" ${editable ? "open" : ""}>
            <summary>ພາບ & Flow prompt</summary>
            <label>ອະທິບາຍພາບ${field(`slides.${i}.visualDescription`, s.visualDescription, { rows: 3, editable })}</label>
            <label>Flow prompt (EN)${field(`slides.${i}.flowPrompt`, s.flowPrompt, { rows: 4, editable, cls: "mono" })}</label>
          </details>
        </div>`,
        )
        .join("")}
    </div>`;
}

function renderVideo(d, editable) {
  const total = d.scenes.reduce((n, s) => n + (Number(s.durationSeconds) || 0), 0);
  return `
    <label>Hook (3 ວິນາທີທຳອິດ)${field("hook", d.hook, { rows: 1, editable })}</label>
    <p class="muted">ລວມ ${total} ວິນາທີ · ${d.scenes.length} scene</p>
    <div class="scenes">
      ${d.scenes
        .map(
          (s, i) => `
        <div class="scene">
          <div class="scene-no">${s.number}<small>${s.durationSeconds}s</small></div>
          <div class="scene-grid">
            <label>ພາບ${field(`scenes.${i}.visual`, s.visual, { rows: 2, editable })}</label>
            <label>ບົດພາກ${field(`scenes.${i}.voiceover`, s.voiceover, { rows: 3, editable })}</label>
            <label>ຂໍ້ຄວາມເທິງຈໍ${field(`scenes.${i}.onScreenText`, s.onScreenText, { rows: 1, editable })}</label>
            <label>Flow / Veo prompt (EN)${field(`scenes.${i}.flowPrompt`, s.flowPrompt, { rows: 3, editable, cls: "mono" })}</label>
            ${sourceLink(s.sourceUrl)}
          </div>
        </div>`,
        )
        .join("")}
    </div>`;
}

function renderContent() {
  const c = state.current;
  const editable = EDITABLE.includes(c.status);
  $("#dlg-type").textContent = TYPE[c.type];
  $("#dlg-status").textContent = STATUS[c.status];
  $("#dlg-status").className = `status s-${c.status}`;
  $("#dlg-title").innerHTML = editable ? `<input data-path="title" class="title-input" value="${esc(c.data.title)}">` : esc(c.data.title);

  $("#dlg-body").innerHTML = `
    ${c.status === "changes_requested" && c.lastFeedback ? `<div class="feedback big">💬 <b>ຄຳຄິດເຫັນຈາກຜູ້ອະນຸມັດ:</b> ${esc(c.lastFeedback)}</div>` : ""}
    ${c.type === "carousel" ? renderCarousel(c.data, editable) : renderVideo(c.data, editable)}
    <div class="two-col">
      <div>
        <h4>Caption</h4>
        ${field("caption", c.data.caption, { rows: 5, editable })}
        <h4>Hashtags</h4>
        ${field("hashtags", (c.data.hashtags || []).join(" "), { rows: 1, editable })}
      </div>
      <div>
        <h4>ໄອເດຍຕົ້ນທາງ</h4>
        <p><b>${esc(c.idea?.title)}</b></p>
        ${renderFacts(c.idea?.keyFacts)}
        <h4>ປະຫວັດ</h4>
        <ul class="history">${c.history
          .map((h) => `<li><span>${esc(fmtDate(h.at))}</span> ${esc(ACTION[h.action] || h.action)}${h.by ? ` · ${esc(h.by)}` : ""}${h.note ? ` — <i>${esc(h.note)}</i>` : ""}</li>`)
          .join("")}</ul>
      </div>
    </div>
    <div id="flow-panel"></div>`;

  renderActions();
  if (["approved", "sent_to_flow"].includes(c.status)) renderFlowPanel();
}

function renderActions() {
  const c = state.current;
  const a = $("#dlg-actions");
  const del = `<button class="btn danger ghost" data-act="delete">ລຶບ</button>`;
  if (EDITABLE.includes(c.status)) {
    a.innerHTML = `
      ${del}
      <div class="revise">
        <input id="revise-note" placeholder="ບອກ AI ວ່າຢາກປັບຫຍັງ ເຊັ່ນ ເຮັດ hook ໃຫ້ແຮງຂຶ້ນ" value="${esc(c.status === "changes_requested" ? c.lastFeedback || "" : "")}">
        <button class="btn" data-act="revise">✨ AI ປັບປຸງ</button>
      </div>
      <button class="btn" data-act="save">💾 ບັນທຶກ</button>
      <button class="btn primary" data-act="submit">ສົ່ງອະນຸມັດ →</button>`;
  } else if (c.status === "pending_approval") {
    a.innerHTML = `
      ${del}
      <div class="revise">
        <input id="review-note" placeholder="ຄຳຄິດເຫັນ (ຈຳເປັນເມື່ອຂໍໃຫ້ແກ້ໄຂ)">
        <button class="btn warn" data-act="request_changes">↩ ຂໍໃຫ້ແກ້ໄຂ</button>
      </div>
      <button class="btn primary" data-act="approve">✓ ອະນຸມັດ</button>`;
  } else {
    a.innerHTML = `
      ${del}
      <div class="revise">
        <input id="review-note" placeholder="ເຫດຜົນທີ່ຕ້ອງແກ້ໄຂ">
        <button class="btn warn" data-act="request_changes">↩ ເປີດໃຫ້ແກ້ໄຂອີກ</button>
      </div>`;
  }
}

function collectEdits() {
  const data = structuredClone(state.current.data);
  $$("#content-dialog [data-path]").forEach((el) => {
    const keys = el.dataset.path.split(".");
    let obj = data;
    keys.slice(0, -1).forEach((k) => (obj = obj[k]));
    const last = keys.at(-1);
    obj[last] = last === "hashtags" ? el.value.split(/\s+/).filter(Boolean) : el.value;
  });
  return data;
}

async function saveEdits() {
  return api(`/contents/${state.current.id}`, { method: "PUT", body: { data: collectEdits() } });
}

async function afterChange(updated, msg) {
  if (!updated) return;
  state.current = updated;
  renderContent();
  await loadContents();
  if (msg) toast(msg, "ok");
}

$("#dlg-actions").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const c = state.current;
  const by = $("#approver-name").value.trim();
  switch (btn.dataset.act) {
    case "save":
      return afterChange(await run("ກຳລັງບັນທຶກ...", saveEdits), "ບັນທຶກແລ້ວ");
    case "revise": {
      const feedback = $("#revise-note").value.trim();
      if (!feedback) return toast("ກະລຸນາບອກສິ່ງທີ່ຢາກໃຫ້ AI ປັບ", "err");
      return afterChange(
        await run("AI ກຳລັງປັບປຸງຕາມຄຳຄິດເຫັນ...", async () => {
          await saveEdits();
          return api(`/contents/${c.id}/revise`, { method: "POST", body: { feedback } });
        }),
        "AI ປັບປຸງແລ້ວ",
      );
    }
    case "submit":
      return afterChange(
        await run("ກຳລັງສົ່ງອະນຸມັດ...", async () => {
          await saveEdits();
          return api(`/contents/${c.id}/submit`, { method: "POST", body: {} });
        }),
        "ສົ່ງອະນຸມັດແລ້ວ",
      );
    case "approve":
      return afterChange(
        await run("ກຳລັງອະນຸມັດ...", () => api(`/contents/${c.id}/approve`, { method: "POST", body: { by } })),
        "ອະນຸມັດແລ້ວ — ພ້ອມສົ່ງໄປ Google Flow",
      );
    case "request_changes": {
      const note = $("#review-note").value.trim();
      if (!note) return toast("ກະລຸນາໃສ່ຄຳຄິດເຫັນ", "err");
      return afterChange(
        await run("ກຳລັງສົ່ງຄຳຄິດເຫັນ...", () => api(`/contents/${c.id}/request_changes`, { method: "POST", body: { note, by } })),
        "ສົ່ງກັບໄປແກ້ໄຂແລ້ວ",
      );
    }
    case "delete":
      if (!confirm("ລຶບຄອນເທັນນີ້?")) return;
      if (await run("ກຳລັງລຶບ...", () => api(`/contents/${c.id}`, { method: "DELETE" }))) {
        $("#content-dialog").close();
        await loadContents();
      }
  }
});

// ---------- Google Flow hand-off ----------
async function renderFlowPanel() {
  const c = state.current;
  const pkg = await api(`/contents/${c.id}/flow`).catch((err) => (toast(err.message, "err"), null));
  if (!pkg || state.current?.id !== c.id) return;
  state.flow = pkg;
  $("#flow-panel").innerHTML = `
    <section class="flow">
      <div class="flow-head">
        <div>
          <h3>🚀 ສົ່ງຕໍ່ Google Flow</h3>
          <p class="muted">Mode: <b>${esc(pkg.mode)}</b> · Aspect ratio: <b>${esc(pkg.aspectRatio)}</b>${c.sentToFlowAt ? ` · ສົ່ງລ່າສຸດ ${esc(fmtDate(c.sentToFlowAt))}` : ""}</p>
        </div>
        <div class="flow-btns">
          <button class="btn" data-flow="copy-all">📋 Copy ທັງໝົດ</button>
          <button class="btn" data-flow="txt">⬇ .txt</button>
          <button class="btn" data-flow="json">⬇ .json</button>
          <button class="btn primary" data-flow="open">ເປີດ Google Flow ↗</button>
        </div>
      </div>
      <ol class="flow-steps">
        <li>ກົດ "ເປີດ Google Flow" (ລະບົບຈະ copy prompt ທັງໝົດໃຫ້ອັດຕະໂນມັດ) ແລະ ສ້າງ project ໃໝ່.</li>
        <li>ເລືອກ mode <b>${esc(pkg.mode)}</b>, ຕັ້ງ aspect ratio, ແລ້ວ copy prompt ແຕ່ລະ${c.type === "carousel" ? "ສະໄລ້" : " scene"} ລຸ່ມນີ້ໄປວາງ.</li>
        <li>${c.type === "carousel" ? "ດາວໂຫຼດພາບ ແລ້ວວາງຂໍ້ຄວາມພາສາລາວໃນ Canva / Figma (AI ສ້າງຕົວອັກສອນລາວບໍ່ຖືກຕ້ອງ)." : "ຕໍ່ clip ໃນ Flow Scenebuilder ຫຼື CapCut, ອັດສຽງບົດພາກ ແລະ ໃສ່ຂໍ້ຄວາມພາສາລາວ."}</li>
      </ol>
      <div class="flow-list">
        ${pkg.prompts
          .map(
            (p, i) => `
          <div class="flow-item">
            <div class="flow-item-head"><b>${esc(p.label)}</b><button class="btn small" data-flow="copy" data-i="${i}">Copy prompt</button></div>
            <pre>${esc(p.prompt)}</pre>
          </div>`,
          )
          .join("")}
      </div>
    </section>`;
}

$("#dlg-body").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-flow]");
  if (!btn || !state.flow) return;
  const pkg = state.flow;
  const slug = pkg.title.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
  switch (btn.dataset.flow) {
    case "copy":
      return copy(pkg.prompts[btn.dataset.i].prompt);
    case "copy-all":
      return copy(pkg.text);
    case "txt":
      return download(`flow-${slug}.txt`, pkg.text);
    case "json":
      return download(`flow-${slug}.json`, JSON.stringify(pkg, null, 2), "application/json");
    case "open": {
      // Start the copy and open the tab inside the click gesture so neither is blocked.
      const copied = copy(pkg.text);
      window.open(pkg.flowUrl, "_blank", "noopener");
      await copied;
      const updated = await api(`/contents/${state.current.id}/send_to_flow`, { method: "POST", body: { by: $("#approver-name").value.trim() } }).catch(
        (err) => (toast(err.message, "err"), null),
      );
      if (updated) await afterChange(updated);
    }
  }
});

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

// ---------- init ----------
let initialTab = "context";
try {
  initialTab = localStorage.getItem("tab") || initialTab;
} catch {}
showTab(initialTab);
Promise.all([loadContext(), loadIdeas(), loadContents()]).catch((err) => toast(err.message, "err"));
