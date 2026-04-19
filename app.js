/**
 * IC Memo Agent — Alpine.js controller
 * 5-step wizard mirroring the Streamlit dashboard.
 */
function icMemoApp() {
  const SLOTS = [
    { id: "ir_deck",          label: "1. IR Deck",            required: true,  accept: ".pdf,.pptx",                    description: "대표 설명자료" },
    { id: "financials",       label: "2. 3개년 재무제표",       required: false, accept: ".xlsx,.xls,.pdf",               description: "PL/BS/CF" },
    { id: "projection",       label: "3. 4-5년 Projection",    required: false, accept: ".xlsx",                          description: "월별/분기별" },
    { id: "cap_table",        label: "4. Cap Table",           required: false, accept: ".xlsx,.pdf",                     description: "현재+Pro-forma" },
    { id: "team_profile",     label: "5. 조직도+핵심인력",      required: false, accept: ".pdf,.pptx,.docx",               description: "" },
    { id: "tech_doc",         label: "6. 기술자료/특허",         required: false, accept: ".pdf,.docx",                     description: "" },
    { id: "prior_ic_memo",    label: "7. 기존 IC memo",         required: false, accept: ".pdf,.docx",                     description: "" },
    { id: "ir_meeting_notes", label: "8. IR 미팅노트",          required: false, accept: ".docx,.md,.txt,.mp3,.wav,.m4a", description: "" },
    { id: "thesis_checklist", label: "9. 투자 목적+Checklist",   required: true,  accept: ".md,.txt,.docx",                description: "" },
    { id: "one_pager",        label: "10. 1 Pager",             required: false, accept: ".md,.txt,.docx",                description: "" },
    { id: "qna",              label: "11. Q&A 정리",            required: false, accept: ".md,.txt,.docx",                description: "" },
    { id: "interviews",       label: "12. 인터뷰",              required: false, accept: ".docx,.md,.txt,.mp3,.wav,.m4a", description: "" },
  ];

  return {
    // --- settings ---
    showSettings: false,
    endpoint: localStorage.getItem("icmemo_endpoint") || "",
    apiKey: localStorage.getItem("icmemo_api_key") || "",
    healthStatus: "",
    healthOk: false,

    // --- wizard ---
    step: 1,
    steps: ["업로드", "파싱&팩트", "Draft", "Red Team", "Final"],
    slots: SLOTS,

    // --- step 1 ---
    companyName: "",
    currentRunId: localStorage.getItem("icmemo_current_run") || "",
    uploadedFiles: {},

    // --- step 2 ---
    parseResult: null,
    factSheet: null,

    // --- step 3 ---
    generating: false,
    draftBuffer: "",
    thinkingBuffer: "",
    _eventSource: null,

    // --- step 4 ---
    rtRounds: 2,
    redteamResult: null,

    // --- client ---
    client: null,

    init() {
      this.client = new IcMemoApiClient(this.endpoint, this.apiKey);
      if (!this.endpoint || !this.apiKey) {
        this.showSettings = true;
      }
    },

    saveSettings() {
      localStorage.setItem("icmemo_endpoint", this.endpoint);
      localStorage.setItem("icmemo_api_key", this.apiKey);
      this.client = new IcMemoApiClient(this.endpoint, this.apiKey);
      this.showSettings = false;
    },

    async checkHealth() {
      this.healthStatus = "⏳ 확인 중...";
      try {
        const r = await this.client.health();
        this.healthStatus = `✅ ${r.status || "ok"} (v${r.version || "?"})`;
        this.healthOk = true;
      } catch (e) {
        this.healthStatus = `❌ ${e.message}`;
        this.healthOk = false;
      }
    },

    async createRun() {
      try {
        const r = await this.client.createRun(this.companyName.trim());
        this.currentRunId = r.run_id;
        localStorage.setItem("icmemo_current_run", r.run_id);
        this.uploadedFiles = {};
      } catch (e) {
        alert(e.message);
      }
    },

    async uploadFile(slotId, file) {
      if (!file) return;
      try {
        await this.client.uploadFile(this.currentRunId, slotId, file);
        const list = this.uploadedFiles[slotId] || [];
        this.uploadedFiles[slotId] = [...list, file.name];
      } catch (e) {
        alert(e.message);
      }
    },

    async parseAll() {
      try {
        this.parseResult = await this.client.parse(this.currentRunId);
      } catch (e) {
        alert(e.message);
      }
    },

    async extractFacts() {
      try {
        this.factSheet = await this.client.facts(this.currentRunId);
      } catch (e) {
        alert(e.message);
      }
    },

    generateDraft() {
      if (this._eventSource) {
        this._eventSource.close();
        this._eventSource = null;
      }
      this.generating = true;
      this.draftBuffer = "";
      this.thinkingBuffer = "";

      const url = this.client.draftStreamUrl(this.currentRunId);
      const es = new EventSource(url);
      this._eventSource = es;

      es.addEventListener("text", (e) => {
        this.draftBuffer += e.data;
      });
      es.addEventListener("thinking", (e) => {
        this.thinkingBuffer += e.data;
      });
      es.addEventListener("done", () => {
        es.close();
        this._eventSource = null;
        this.generating = false;
      });
      es.addEventListener("error", () => {
        es.close();
        this._eventSource = null;
        this.generating = false;
        if (!this.draftBuffer) {
          alert("스트림 오류 — 백엔드 또는 endpoint/API key 확인");
        }
      });
    },

    async runRedteam() {
      try {
        this.redteamResult = await this.client.redteam(this.currentRunId, this.rtRounds);
      } catch (e) {
        alert(e.message);
      }
    },

    downloadUrl(format) {
      return this.client.exportUrl(this.currentRunId, format);
    },

    renderMarkdown(md) {
      try {
        return marked.parse(md || "");
      } catch (e) {
        return `<pre>${(md || "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`;
      }
    },
  };
}

window.icMemoApp = icMemoApp;
