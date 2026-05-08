# ITR Extract — Frontend

React SPA cho hệ thống ITR Extract: upload PDF Income Tax Return, xem kết quả phân tích, tạo email draft trong Outlook.

Backend ở repo [`itr_extract`](../itr_extract/).

---

## Tech stack

| | |
|---|---|
| Framework | React 19 + Vite 7 |
| Language | TypeScript |
| Auth | `@azure/msal-browser` + `@azure/msal-react` (Microsoft Entra) |
| Style | Inline styles (chưa có UI library) |

---

## Prerequisites

- **Node.js 20+** (khuyến nghị 22 LTS)
- **Backend đang chạy** ở `http://localhost:8000` — xem [itr_extract/README.md](../itr_extract/README.md)
- **Azure AD App Registration** — đã setup khi config backend (cùng client ID)

---

## Quick start

```bash
# 1. Cài deps
npm install

# 2. Cấu hình
cp .env.example .env
# → mở .env, điền VITE_MSAL_CLIENT_ID, VITE_MSAL_BE_CLIENT_ID
#   (cùng giá trị, là client ID của Azure AD app registration)

# 3. Chạy dev server
npm run dev
```

Mở [http://localhost:5173](http://localhost:5173).

---

## Cấu hình `.env`

```bash
cp .env.example .env
```

| Var | Dev | Production |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000` | `https://your-backend-domain.com` |
| `VITE_MSAL_CLIENT_ID` | Azure AD app client ID | client ID |
| `VITE_MSAL_BE_CLIENT_ID` | (cùng giá trị `CLIENT_ID`) | (cùng giá trị) |
| `VITE_MSAL_TENANT_ID` | **để trống** | tenant ID của khách hàng |

> 💡 `VITE_MSAL_CLIENT_ID` và `VITE_MSAL_BE_CLIENT_ID` thường là cùng một giá trị vì frontend (SPA) và backend API dùng chung một app registration.

> ⚠️ Sau khi đổi `.env`, restart `npm run dev` (Vite chỉ đọc `.env` lúc khởi động).

---

## Auth flow — Dev vs Production

Hệ thống tự động switch giữa hai mode dựa trên `VITE_MSAL_TENANT_ID`:

### Dev mode (`VITE_MSAL_TENANT_ID` để trống)

- `authority = https://login.microsoftonline.com/common`
- Login bằng **personal Microsoft account** (outlook/hotmail) hoặc work account
- `loginRequest.scopes = ['User.Read', 'Mail.ReadWrite']`
- FE gửi **ID token** lên BE (vì personal accounts không support custom `api://...` scope, và Graph access token là opaque không validate được)

### Production mode (`VITE_MSAL_TENANT_ID` được set)

- `authority = https://login.microsoftonline.com/{tenant-id}`
- Chỉ nhân viên của tenant đó login được
- `loginRequest.scopes = ['User.Read', 'Mail.ReadWrite', api://.../access_as_user]` — consent đầy đủ ngay khi login
- FE gửi **access token** lên BE (chuẩn OAuth2 với custom audience)

**Switch chỉ cần đổi 1 env var** — không cần đổi code.

Logic switch nằm trong [src/lib/msalConfig.ts](src/lib/msalConfig.ts) — đọc `import.meta.env.VITE_MSAL_TENANT_ID` rồi tự build authority + scopes.

---

## Available scripts

```bash
npm run dev      # Vite dev server (port 5173, HMR)
npm run build    # Build production bundle → dist/
npm run preview  # Serve production build local
npm run lint     # ESLint
```

---

## Project structure

```
src/
├── App.tsx                   Root component, login gate
├── main.tsx                  Entry, MSAL initialization
├── lib/
│   ├── msalConfig.ts         MSAL config + dev/prod mode switch
│   ├── apiClient.ts          fetch wrapper với Bearer token
│   ├── graphApi.ts           Microsoft Graph (Mail draft)
│   ├── types.ts              Shared types (Job, JobStatus...)
│   └── constants.ts          UI constants (polling interval...)
├── hooks/
│   ├── useAccessToken.ts     Lấy token cho BE API call
│   ├── useJobs.ts            CRUD jobs (list, create, delete, reprocess)
│   └── useJobPolling.ts      Poll job status đến khi terminal
└── components/
    ├── UploadCard.tsx        File upload drag-drop
    ├── JobHistory.tsx        Sidebar list jobs
    ├── JobDetailView.tsx     Detail panel — kết quả + Mail draft button
    ├── JobStatusBadge.tsx    Status pill component
    └── ResultPanel.tsx       Render extracted data + email preview

public/
├── blank.html                (Legacy, không dùng — để cho redirect compat)
├── favicon.svg
└── icons.svg
```

---

## Switching to production

Sau khi setup dev xong, deploy production chỉ cần:

### 1. Cập nhật Azure AD

- Đảm bảo redirect URI production (vd `https://your-frontend.com`) đã được đăng ký trong app registration
- Admin của khách hàng grant consent cho các scope cần thiết

### 2. Cập nhật `.env`

```diff
+VITE_MSAL_TENANT_ID=<tenant-id-của-khách-hàng>
-VITE_API_BASE_URL=http://localhost:8000
+VITE_API_BASE_URL=https://your-backend-domain.com
```

### 3. Build & deploy

```bash
npm run build
# → dist/ chứa static files, deploy lên CDN / nginx / Vercel
```

> ⚠️ Backend cũng phải set `MSAL_TENANT_ID` đồng thời. Nếu mismatch (FE production + BE dev hoặc ngược lại), token validation sẽ fail.

---

## Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Console: `:5173/undefined/api/jobs` | `VITE_API_BASE_URL` chưa set | Thêm vào `.env`, restart `npm run dev` |
| Login `redirect_uri not valid` | URI chưa đăng ký trong Azure AD | App Registration → Authentication → thêm SPA redirect URI |
| Login `invalid_scope` | `access_as_user` chưa expose trong Azure AD | App Registration → Expose an API → Add scope |
| Login với personal account báo `redirect_uri not valid` từ `login.live.com` | Personal accounts không support custom API scope | Đảm bảo `VITE_MSAL_TENANT_ID` để TRỐNG trong dev |
| API trả 401 sau khi login OK | FE và BE mode mismatch | Đảm bảo cả `VITE_MSAL_TENANT_ID` (FE) và `MSAL_TENANT_ID` (BE) cùng set hoặc cùng trống |
| Console spam `GET /api/jobs` vô tận | (Đã fix) `getToken` recreate mỗi render | Pull code mới — `useJobs` đã dùng `useRef` |
| Popup login không đóng sau khi chọn account | (Đã fix) | Code hiện dùng `loginRedirect` không phải popup |
| `npm run dev` không pick up env mới | Vite cache `.env` | Ctrl+C rồi `npm run dev` lại |

Chi tiết: [../itr_extract/docs/SETUP_REPORT.md](../itr_extract/docs/SETUP_REPORT.md)

---

## Notes

- **MSAL cache:** `sessionStorage`. Mở tab mới = login lại. Đổi sang `localStorage` trong `msalConfig.ts` nếu muốn persist.
- **Polling:** `useJobPolling` poll status với interval theo `POLLING_INTERVAL_MS`. Sẽ stop khi job chuyển sang terminal status (`success`, `failed`).
- **Logout:** Chưa có button logout. Tạm thời clear `sessionStorage` trong DevTools để logout.
