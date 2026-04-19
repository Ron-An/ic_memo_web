# IC Memo Agent — Web Frontend

의존성 0 정적 HTML SPA. CDN 만 사용 (Tailwind, Alpine.js, marked.js).
브라우저에서 FastAPI 백엔드(`api/`) 를 호출해 5 단계 wizard 로 IC 메모를 생성한다.

```
web/
├── index.html      # 5-step wizard UI (Tailwind 다크 테마)
├── styles.css      # prose 표/코드/blockquote 보강
├── api-client.js   # IcMemoApiClient (fetch + multipart + EventSource URL)
├── app.js          # Alpine.js 컨트롤러 (icMemoApp())
└── README.md
```

## 로컬 테스트

```powershell
cd C:\Users\akn90\ic_memo_agent\web
"C:/Users/akn90/AppData/Roaming/IBM/SPSS Statistics/one/Python310/Scripts/python.exe" -m http.server 5500
```

브라우저에서 `http://localhost:5500` 열면 5 단계 wizard 가 표시된다.

## 백엔드 연결

1. `api/` 디렉토리의 FastAPI 서버를 띄운다 (별도 문서 참조).
2. Cloudflare Tunnel 등으로 외부 노출:
   ```powershell
   cloudflared tunnel --url http://localhost:8000
   ```
   → `https://<random>.trycloudflare.com` 발급.
3. 웹 페이지 우측 상단 **⚙️ 설정** 클릭 → endpoint URL + API Key 입력 → 저장.
4. **연결 테스트** 버튼으로 `/api/health` 확인.

저장 값은 브라우저 `localStorage` 에 보관 — 다른 PC/브라우저에서는 다시 입력 필요.

## 5 단계 워크플로우

| Step | 화면 | 백엔드 엔드포인트 |
|------|------|------------------|
| 1 | 회사명 + 12 슬롯 파일 업로드 | `POST /api/runs`, `POST /api/runs/{id}/upload` |
| 2 | 파싱 + 팩트 추출 | `POST /api/runs/{id}/parse`, `POST /api/runs/{id}/facts` |
| 3 | Draft 생성 (SSE 스트리밍, thinking 표시) | `GET  /api/runs/{id}/draft/stream` |
| 4 | Red Team 4 페르소나 공방 (1~3 라운드) | `POST /api/runs/{id}/redteam` |
| 5 | Final Touch + Export (md / docx) | `GET  /api/runs/{id}/export?format=...` |

## 보안 메모

- `EventSource` 와 `<a download>` 는 커스텀 헤더를 보낼 수 없으므로 API 키를 `?_k=` 쿼리 파라미터로 전달한다.
  백엔드는 `X-API-Key` 헤더 또는 `_k` 쿼리 파라미터 둘 다 받아야 한다.
- API Key 는 브라우저 `localStorage` 에 평문 저장된다 — 공용 PC 에서는 사용 후 설정 모달에서 비우거나 DevTools → Application → Local Storage 에서 삭제.

## GitHub Pages 배포

루트의 `.github/workflows/deploy.yml` 가 `web/` 변경 시 자동 배포한다.

1. GitHub 저장소 → **Settings → Pages → Source = GitHub Actions** 로 설정.
2. `master` (또는 `main`) 브랜치에 `web/` 변경사항 push.
3. Actions 탭에서 `Deploy web/ to GitHub Pages` 워크플로우 완료 후 표시되는 URL 접속.
4. 커스텀 도메인을 쓰려면 `web/CNAME` 에 도메인을 한 줄 적어둔다 (Pages 가 자동 인식).

## 개발 팁

- Alpine.js 변경은 `index.html` 의 `x-data="icMemoApp()"` 트리에서만 반응 — 모달도 같은 컴포넌트 안에 있다.
- `window.IcMemoApiClient` / `window.icMemoApp` 으로 콘솔에서 직접 호출 가능 (디버깅용).
- 마크다운 렌더링은 `marked.parse()` — 추가 sanitize 가 필요하면 DOMPurify CDN 추가.
