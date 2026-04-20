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
    { id: "team_profile",     label: "5. 조직도+핵심인력",      required: false, accept: ".pdf,.pptx,.docx",               description: "조직도/프로필" },
    { id: "tech_doc",         label: "6. 기술자료/특허",         required: false, accept: ".pdf,.docx",                     description: "기술 사양/특허" },
    { id: "prior_ic_memo",    label: "7. 기존 IC memo",         required: false, accept: ".pdf,.docx",                     description: "공동 투자사 등" },
    { id: "ir_meeting_notes", label: "8. IR 미팅노트",          required: false, accept: ".docx,.md,.txt,.mp3,.wav,.m4a", description: "미팅 기록/녹음" },
    { id: "thesis_checklist", label: "9. 투자 목적+Checklist",   required: true,  accept: ".md,.txt,.docx",                description: "투자 가설" },
    { id: "one_pager",        label: "10. 1 Pager",             required: false, accept: ".md,.txt,.docx",                description: "요약 1장" },
    { id: "qna",              label: "11. Q&A 정리",            required: false, accept: ".md,.txt,.docx",                description: "질의응답" },
    { id: "interviews",       label: "12. 인터뷰",              required: false, accept: ".docx,.md,.txt,.mp3,.wav,.m4a", description: "전문가/고객/주주" },
  ];

  // 확장자 → 슬롯 fallback (파일명 prefix 매칭 실패 시 사용)
  const EXT_TO_SLOT = {
    ".pptx": "ir_deck",
    ".pdf":  "ir_deck",
    ".xlsx": "financials",
    ".xls":  "financials",
    ".docx": "thesis_checklist",
    ".md":   "thesis_checklist",
    ".txt":  "thesis_checklist",
    ".mp3":  "ir_meeting_notes",
    ".wav":  "ir_meeting_notes",
    ".m4a":  "ir_meeting_notes",
    ".zip":  "ir_meeting_notes",  // Notion export
  };

  return {
    // --- settings ---
    showSettings: false,
    endpoint: localStorage.getItem("icmemo_endpoint") || "",
    apiKey: localStorage.getItem("icmemo_api_key") || "",
    healthStatus: "",
    healthOk: false,

    // --- wizard ---
    step: 1,
    steps: ["업로드", "파싱 & 팩트", "Draft", "Red Team", "Final"],
    slots: SLOTS,

    // --- step 1 ---
    companyName: "",
    currentRunId: localStorage.getItem("icmemo_current_run") || "",
    uploadedFiles: {},

    // --- step 1: bulk drag-drop ---
    dragActive: false,
    bulkQueue: [],          // [{name, size, file, slotId, guessed}]
    bulkUploading: false,

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
        this.bulkQueue = [];
      } catch (e) {
        alert(e.message);
      }
    },

    // ── 슬롯 자동 추정 ────────────────────────────────────────
    guessSlotForFile(filename) {
      const lower = filename.toLowerCase();
      // 1) prefix 매칭 (ir_deck_*.pdf, financials-*.xlsx 등)
      for (const slot of SLOTS) {
        if (lower.startsWith(slot.id + "_") || lower.startsWith(slot.id + "-")) {
          return { slotId: slot.id, guessed: false };
        }
      }
      // 2) 확장자 fallback
      const dot = lower.lastIndexOf(".");
      const ext = dot >= 0 ? lower.slice(dot) : "";
      const fallback = EXT_TO_SLOT[ext] || "ir_deck";
      return { slotId: fallback, guessed: true };
    },

    // ── 드래그 드롭 / 파일 선택 → 큐에 추가 ──────────────────
    handleDrop(event) {
      const files = Array.from(event.dataTransfer?.files || []);
      this.queueFiles(files);
    },

    handleBulkPick(event) {
      const files = Array.from(event.target.files || []);
      this.queueFiles(files);
      event.target.value = "";  // 같은 파일 재선택 가능
    },

    queueFiles(files) {
      if (!files.length) return;
      const newItems = files.map((f) => {
        const { slotId, guessed } = this.guessSlotForFile(f.name);
        return { name: f.name, size: f.size, file: f, slotId, guessed };
      });
      this.bulkQueue = [...this.bulkQueue, ...newItems];
    },

    // ── 큐 일괄 업로드 ────────────────────────────────────────
    async uploadBulk() {
      if (!this.bulkQueue.length || this.bulkUploading) return;
      if (!this.currentRunId) {
        alert("먼저 회사명 입력 후 '새 Run 시작' 클릭하세요.");
        return;
      }
      this.bulkUploading = true;
      const errors = [];
      // 직렬 업로드 (백엔드 lock 안전 + 진행 가시성)
      const queue = [...this.bulkQueue];
      for (const item of queue) {
        try {
          await this.client.uploadFile(this.currentRunId, item.slotId, item.file);
          const list = this.uploadedFiles[item.slotId] || [];
          this.uploadedFiles[item.slotId] = [...list, item.name];
          // 큐에서 즉시 제거 (UI 피드백)
          const idx = this.bulkQueue.findIndex(x => x.name === item.name && x.size === item.size);
          if (idx >= 0) this.bulkQueue.splice(idx, 1);
        } catch (e) {
          errors.push(`${item.name}: ${e.message}`);
        }
      }
      this.bulkUploading = false;
      if (errors.length) {
        alert(`${errors.length}건 실패:\n` + errors.slice(0, 5).join("\n"));
      }
    },

    // ── 슬롯 단위 업로드 (개별) ──────────────────────────────
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

    hasAnyUpload() {
      return Object.values(this.uploadedFiles).some(arr => arr && arr.length);
    },

    // ── Step 2~5 ──────────────────────────────────────────────
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
