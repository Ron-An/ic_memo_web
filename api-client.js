/**
 * IC Memo Agent — REST API client (browser, no deps)
 * Wraps the FastAPI backend served from `api/`.
 */
class IcMemoApiClient {
  constructor(endpoint, apiKey) {
    this.endpoint = (endpoint || "").replace(/\/+$/, "");
    this.apiKey = apiKey || "";
  }

  _headers(extra = {}) {
    return { "X-API-Key": this.apiKey, ...extra };
  }

  async _json(method, path, body) {
    const opts = {
      method,
      headers: this._headers({ "Content-Type": "application/json" }),
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(this.endpoint + path, opts);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`${method} ${path} → HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }

  // --- Health ---
  health() {
    return this._json("GET", "/api/health");
  }

  // --- Runs ---
  createRun(companyName) {
    return this._json("POST", "/api/runs", { company_name: companyName });
  }
  listRuns() {
    return this._json("GET", "/api/runs");
  }
  getRun(runId) {
    return this._json("GET", `/api/runs/${runId}`);
  }

  // --- Upload (multipart) ---
  async uploadFile(runId, slotId, file) {
    const fd = new FormData();
    fd.append("slot_id", slotId);
    fd.append("file", file);
    const res = await fetch(`${this.endpoint}/api/runs/${runId}/upload`, {
      method: "POST",
      headers: this._headers(), // no Content-Type — browser sets boundary
      body: fd,
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`upload HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }
    return res.json();
  }

  // --- Pipeline steps ---
  parse(runId) {
    return this._json("POST", `/api/runs/${runId}/parse`);
  }
  facts(runId, opts = {}) {
    return this._json("POST", `/api/runs/${runId}/facts`, opts);
  }
  draft(runId, opts = {}) {
    return this._json("POST", `/api/runs/${runId}/draft`, opts);
  }
  redteam(runId, rounds = 2) {
    return this._json("POST", `/api/runs/${runId}/redteam`, { rounds });
  }

  // --- Streaming + Export (URLs) ---
  // EventSource cannot send custom headers — pass key via query string,
  // backend should accept either X-API-Key header or `_k` query param.
  draftStreamUrl(runId) {
    return `${this.endpoint}/api/runs/${runId}/draft/stream?_k=${encodeURIComponent(this.apiKey)}`;
  }
  exportUrl(runId, format = "md") {
    return `${this.endpoint}/api/runs/${runId}/export?format=${encodeURIComponent(format)}&_k=${encodeURIComponent(this.apiKey)}`;
  }
}

// Expose for app.js (no module bundler).
window.IcMemoApiClient = IcMemoApiClient;
