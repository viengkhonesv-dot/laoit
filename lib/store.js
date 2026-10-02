// JSON-file store: ເກັບ context, ໄອເດຍ ແລະ ຄອນເທັນ ໄວ້ໃນ data/db.json
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const DEFAULT_CONTEXT = {
  brandName: "",
  about: "",
  courses: "",
  audience: "",
  tone: "",
  contentPillars: "",
  dos: "",
  donts: "",
  cta: "",
  hashtags: "",
  references: "",
};

function emptyDb() {
  return { context: { ...DEFAULT_CONTEXT }, ideas: [], contents: [] };
}

export class Store {
  constructor(file) {
    this.file = file;
    this.db = null;
    this.queue = Promise.resolve();
  }

  async load() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const raw = await readFile(this.file, "utf8");
      this.db = { ...emptyDb(), ...JSON.parse(raw) };
      this.db.context = { ...DEFAULT_CONTEXT, ...this.db.context };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      this.db = emptyDb();
      await this.save();
    }
    return this;
  }

  // Serialise writes so concurrent requests never interleave a partial file.
  save() {
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(this.db, null, 2));
      await rename(tmp, this.file);
    });
    return this.queue;
  }

  getContext() {
    return this.db.context;
  }

  async setContext(patch) {
    const next = { ...this.db.context };
    for (const key of Object.keys(DEFAULT_CONTEXT)) {
      if (typeof patch[key] === "string") next[key] = patch[key];
    }
    next.updatedAt = new Date().toISOString();
    this.db.context = next;
    await this.save();
    return next;
  }

  listIdeas() {
    return [...this.db.ideas].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getIdea(id) {
    return this.db.ideas.find((i) => i.id === id);
  }

  async addIdeas(ideas) {
    const now = new Date().toISOString();
    const saved = ideas.map((idea) => ({ id: randomUUID(), createdAt: now, status: "new", ...idea }));
    this.db.ideas.push(...saved);
    await this.save();
    return saved;
  }

  async updateIdea(id, patch) {
    const idea = this.getIdea(id);
    if (!idea) return null;
    Object.assign(idea, patch, { updatedAt: new Date().toISOString() });
    await this.save();
    return idea;
  }

  async deleteIdea(id) {
    const before = this.db.ideas.length;
    this.db.ideas = this.db.ideas.filter((i) => i.id !== id);
    if (this.db.ideas.length === before) return false;
    await this.save();
    return true;
  }

  listContents() {
    return [...this.db.contents].sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
    );
  }

  getContent(id) {
    return this.db.contents.find((c) => c.id === id);
  }

  async addContent(content) {
    const now = new Date().toISOString();
    const saved = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      status: "draft",
      history: [{ at: now, action: "created" }],
      ...content,
    };
    this.db.contents.push(saved);
    await this.save();
    return saved;
  }

  async updateContent(id, patch, action) {
    const content = this.getContent(id);
    if (!content) return null;
    const now = new Date().toISOString();
    Object.assign(content, patch, { updatedAt: now });
    if (action) content.history.push({ at: now, ...action });
    await this.save();
    return content;
  }

  async deleteContent(id) {
    const before = this.db.contents.length;
    this.db.contents = this.db.contents.filter((c) => c.id !== id);
    if (this.db.contents.length === before) return false;
    await this.save();
    return true;
  }
}
