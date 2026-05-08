import type { Configuration, PopupRequest } from '@azure/msal-browser';

// ─────────────────────────────────────────────────────────────────
// AUTHORITY — đổi giá trị này khi chuyển môi trường:
//
// TEST (hiện tại) — personal @outlook.com/@hotmail.com:
//   authority: 'https://login.microsoftonline.com/common'
//   App registration: multi-tenant + personal accounts
//   Ai cũng login được, mỗi user tự consent, không cần IT admin
//
// PRODUCTION — client doanh nghiệp (single-tenant):
//   authority: `https://login.microsoftonline.com/${TENANT_ID_CỦA_CLIENT}`
//   App registration: single-tenant (accounts in this org only)
//   Chỉ nhân viên của client mới login được
//   Cần IT admin của client grant consent 1 lần
// ─────────────────────────────────────────────────────────────────

const IS_PRODUCTION = false; // ← đổi thành true khi deploy cho client

const authority = IS_PRODUCTION
  ? `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID as string}`
  : 'https://login.microsoftonline.com/common';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID as string,
    authority,
    redirectUri: 'http://localhost:5173',
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

// redirectUri trỏ đến blank.html — dùng trong loginPopup call
export const popupRedirectUri = `${window.location.origin}/blank.html`;

export const loginRequest: PopupRequest = {
  scopes: ['User.Read', 'Mail.ReadWrite'],
  prompt: 'select_account',
};
