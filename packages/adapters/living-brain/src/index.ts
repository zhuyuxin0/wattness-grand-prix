export type AuthMode = "bearer" | "api-key";
export type SourceStatus = "pending" | "compiling" | "completed" | "failed";
export interface Brain { id: string; name: string; createdAt: string }
export interface Source {
  id: string; brainId: string; status: SourceStatus; createdAt: string;
  compiledAt: string | null; affectedPageIds?: string[]; lastError?: string | null;
}
export interface Page {
  id: string; brainId: string; slug: string; title: string; body: string;
  version: number; status: string; createdAt: string; updatedAt: string;
  lastCompiledAt: string; sources: Array<{ ingestSourceId: string; attachedAt: string }>;
}
export interface Hit { slug: string; status: string }
export interface Evidence {
  observedAt: string; endpoint: string; method: string; status: number;
  request: unknown; response: unknown; requestId: string | null;
}
export interface ClientOptions {
  apiKey: string; subjectId: string; authMode?: AuthMode;
  fetch?: typeof globalThis.fetch; onEvidence?: (evidence: Evidence) => void;
  timeoutMs?: number; now?: () => Date;
}
export class MemoryError extends Error {
  override name = "MemoryError";
  constructor(message: string, public readonly status?: number) { super(message); }
}
function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new MemoryError("Expected an API object");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new MemoryError("Missing " + name);
  return value;
}
function validTime(value: string): number {
  const n = Date.parse(value);
  if (!Number.isFinite(n)) throw new MemoryError("Invalid availability timestamp");
  return n;
}
function source(value: unknown): Source {
  const x = object(value), status = text(x.status, "source status");
  if (!["pending", "compiling", "completed", "failed"].includes(status)) {
    throw new MemoryError("Unknown ingest state");
  }
  return {
    id: text(x.id, "source id"), brainId: text(x.brainId, "source brain"),
    status: status as SourceStatus, createdAt: text(x.createdAt, "source creation time"),
    compiledAt: typeof x.compiledAt === "string" ? x.compiledAt : null,
    ...(Array.isArray(x.affectedPageIds) ? { affectedPageIds: x.affectedPageIds.filter((v): v is string => typeof v === "string") } : {}),
    ...(typeof x.lastError === "string" ? { lastError: x.lastError } : {}),
  };
}
function page(value: unknown): Page {
  const x = object(value);
  if (!Number.isSafeInteger(x.version) || Number(x.version) < 1 || !Array.isArray(x.sources)) {
    throw new MemoryError("Missing page version or sources");
  }
  return {
    id: text(x.id, "page id"), brainId: text(x.brainId, "page brain"),
    slug: text(x.slug, "page slug"), title: text(x.title, "page title"),
    body: text(x.body, "page body"), version: Number(x.version),
    status: text(x.status, "page status"), createdAt: text(x.createdAt, "page creation"),
    updatedAt: text(x.updatedAt, "page update"), lastCompiledAt: text(x.lastCompiledAt, "page compilation"),
    sources: x.sources.map(v => {
      const ref = object(v);
      return { ingestSourceId: text(ref.ingestSourceId, "source reference"), attachedAt: text(ref.attachedAt, "source attachment") };
    }),
  };
}
export function redact(value: unknown, secrets: readonly string[] = []): unknown {
  if (typeof value === "string") {
    let clean = value;
    for (const secret of secrets) if (secret.length > 0) clean = clean.split(secret).join("[REDACTED]");
    return clean.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[CONTACT REDACTED]");
  }
  if (Array.isArray(value)) return value.map(v => redact(v, secrets));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [
      key, /^(authorization|x-api-key|x-subject-id|apiKey|subjectId|tenantId)$/i.test(key) ? "[REDACTED]" : redact(v, secrets),
    ]));
  }
  return value;
}
function safePathPart(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new MemoryError("Invalid API identifier");
  return encodeURIComponent(value);
}
export class LivingBrain {
  #key: string;
  #subject: string;
  #auth: AuthMode;
  #fetch: typeof globalThis.fetch;
  #onEvidence: ((evidence: Evidence) => void) | undefined;
  #timeout: number;
  #now: () => Date;
  constructor(options: ClientOptions) {
    this.#key = text(options.apiKey, "API key");
    this.#subject = text(options.subjectId, "subject");
    this.#auth = options.authMode ?? "bearer";
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#onEvidence = options.onEvidence;
    this.#timeout = options.timeoutMs ?? 20000;
    this.#now = options.now ?? (() => new Date());
    if (!Number.isFinite(this.#timeout) || this.#timeout <= 0) throw new MemoryError("Invalid request timeout");
  }
  async #request(method: string, path: string, body?: unknown): Promise<unknown> {
    const endpoint = "https://api.livingbrain.com/v1" + path;
    const headers = new Headers({ "x-subject-id": this.#subject, Accept: "application/json" });
    if (this.#auth === "bearer") headers.set("Authorization", "Bearer " + this.#key);
    else headers.set("x-api-key", this.#key);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    if (serialized && /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(serialized)) {
      throw new MemoryError("Contact addresses are not permitted in external captures");
    }
    let response: Response;
    try {
      response = await this.#fetch(endpoint, { method, headers, ...(serialized ? { body: serialized } : {}), signal: AbortSignal.timeout(this.#timeout), redirect: "error" });
    } catch {
      throw new MemoryError("Living Brain request failed before a response; no automatic replay");
    }
    const raw = await response.text();
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = { nonJsonBody: raw.slice(0, 500) }; }
    const sensitive = [this.#key, this.#subject];
    this.#onEvidence?.({
      observedAt: this.#now().toISOString(), endpoint, method, status: response.status,
      request: redact({ headers: Object.fromEntries(headers), ...(body !== undefined ? { body } : {}) }, sensitive),
      response: redact(parsed, sensitive),
      requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id"),
    });
    if (!response.ok) throw new MemoryError("Living Brain returned HTTP " + response.status, response.status);
    if (parsed === null) throw new MemoryError("Empty API response");
    return parsed;
  }
  async listBrains(): Promise<Brain[]> {
    const value = await this.#request("GET", "/brains?limit=100&offset=0");
    const list = Array.isArray(value) ? value : object(value).items;
    if (!Array.isArray(list)) throw new MemoryError("Missing brain list");
    return list.map(v => { const x = object(v); return { id: text(x.id, "brain id"), name: text(x.name, "brain name"), createdAt: text(x.createdAt, "brain creation") }; });
  }
  async createBrain(name: string, description: string): Promise<Brain> {
    const x = object(await this.#request("POST", "/brains", { name, description }));
    return { id: text(x.id, "brain id"), name: text(x.name, "brain name"), createdAt: text(x.createdAt, "brain creation") };
  }
  async capture(brainId: string, content: string, label: string, originRef: string): Promise<Source> {
    if (!originRef) throw new MemoryError("Capture requires an originRef");
    return source(await this.#request("POST", "/brains/" + safePathPart(brainId) + "/captures", {
      kind: "note", content, label, originRef, bucket: "projects", source: { channel: "wattness-review", ref: originRef },
    }));
  }
  async sources(brainId: string, ids: readonly string[]): Promise<Source[]> {
    if (ids.length === 0) return [];
    const query = new URLSearchParams({ ids: ids.map(safePathPart).join(","), limit: String(Math.min(ids.length, 100)), offset: "0" });
    const value = object(await this.#request("GET", "/brains/" + safePathPart(brainId) + "/sources?" + query));
    if (!Array.isArray(value.items)) throw new MemoryError("Missing sources");
    const items = value.items.map(source);
    if (items.some(x => x.brainId !== brainId || !ids.includes(x.id))) throw new MemoryError("Cross-brain or unrequested source returned");
    return items;
  }
  async waitForCapture(brainId: string, sourceId: string, options: { attempts?: number; intervalMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<Source> {
    const attempts = options.attempts ?? 75, interval = options.intervalMs ?? 4000;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 300 || interval < 0 || interval > 10000) {
      throw new MemoryError("Invalid polling bounds");
    }
    const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
    for (let i = 0; i < attempts; i++) {
      const s = (await this.sources(brainId, [sourceId])).find(x => x.id === sourceId);
      if (!s) throw new MemoryError("Captured source not found");
      if (s.status === "failed") throw new MemoryError("Capture compilation failed");
      if (s.status === "completed") {
        if (!s.compiledAt) throw new MemoryError("Completed capture lacks availability time");
        validTime(s.compiledAt);
        return s;
      }
      if (i + 1 < attempts) await sleep(interval);
    }
    throw new MemoryError("Capture is still pending after the bounded poll");
  }
  async search(brainId: string, query: string): Promise<Hit[]> {
    const value = await this.#request("POST", "/brains/" + safePathPart(brainId) + "/search", { query, topK: 5 });
    if (!Array.isArray(value)) throw new MemoryError("Missing search hits");
    return value.map(v => { const x = object(v); return { slug: text(x.slug, "hit slug"), status: text(x.status, "hit status") }; });
  }
  async readPage(brainId: string, slug: string): Promise<Page> {
    const p = page(await this.#request("GET", "/brains/" + safePathPart(brainId) + "/pages/" + safePathPart(slug)));
    if (p.brainId !== brainId || p.slug !== slug) throw new MemoryError("Cross-brain or wrong page returned");
    return p;
  }
  async graph(brainId: string): Promise<unknown> {
    return this.#request("GET", "/brains/" + safePathPart(brainId) + "/graph?nodeLimit=25");
  }
  async retrieveAt(brainId: string, query: string, cutoff: string): Promise<Retrieval> {
    validTime(cutoff);
    const hits = await this.search(brainId, query);
    const pages: CitedPage[] = [], exclusions: Array<{ slug: string; reason: string }> = [];
    for (const hit of hits) {
      if (hit.status !== "active") { exclusions.push({ slug: hit.slug, reason: "Page is not active" }); continue; }
      const p = await this.readPage(brainId, hit.slug);
      const ids = p.sources.map(s => s.ingestSourceId);
      const sources = await this.sources(brainId, ids);
      const check = pageAvailableAt(p, sources, cutoff);
      if (!check.ok) { exclusions.push({ slug: p.slug, reason: check.reason }); continue; }
      pages.push({ page: p, citation: { slug: p.slug, version: p.version, availableAt: check.availableAt, sourceIds: ids } });
    }
    return { cutoff, pages, exclusions };
  }
}
export type Availability = { ok: true; availableAt: string } | { ok: false; reason: string };
export function pageAvailableAt(page: Page, sources: readonly Source[], cutoff: string): Availability {
  if (page.status !== "active") return { ok: false, reason: "Page is not active" };
  if (page.sources.length === 0) return { ok: false, reason: "Page has no source provenance" };
  try {
    const times = [validTime(page.createdAt), validTime(page.updatedAt), validTime(page.lastCompiledAt)];
    for (const ref of page.sources) {
      const s = sources.find(x => x.id === ref.ingestSourceId);
      if (!s || s.brainId !== page.brainId || s.status !== "completed" || !s.compiledAt) {
        return { ok: false, reason: "Source completion or availability is unknown" };
      }
      times.push(validTime(ref.attachedAt), validTime(s.createdAt), validTime(s.compiledAt));
    }
    const available = Math.max(...times);
    if (available > validTime(cutoff)) return { ok: false, reason: "Page or source became available after the decision cutoff" };
    return { ok: true, availableAt: new Date(available).toISOString() };
  } catch { return { ok: false, reason: "Availability timestamp is invalid or missing" }; }
}
export interface Citation { slug: string; version: number; availableAt: string; sourceIds: string[] }
export interface CitedPage { page: Page; citation: Citation }
export interface Retrieval { cutoff: string; pages: CitedPage[]; exclusions: Array<{ slug: string; reason: string }> }
export interface ReviewDecision {
  classification: "assumed-entry-scenario" | "needs-supported-review";
  requireExecutableQuoteForTradingClaim: boolean;
  explanation: string; citations: Citation[];
}
export function reviewFromMemory(retrieval: Retrieval): ReviewDecision {
  const supported = retrieval.pages.filter(x => /assumed|fair[ -]?value/i.test(x.page.body) && /scenario|execut/i.test(x.page.body));
  if (supported.length === 0) return {
    classification: "needs-supported-review", requireExecutableQuoteForTradingClaim: true,
    explanation: "The available memory does not support an entry classification; request a cited review.",
    citations: [],
  };
  return {
    classification: "assumed-entry-scenario", requireExecutableQuoteForTradingClaim: true,
    explanation: "The reviewed memory classifies the model fair-value entry as an assumed scenario comparison. Keep that assumption beside the result; an executable quote is required for a trading-profit claim.",
    citations: supported.map(x => x.citation),
  };
}
