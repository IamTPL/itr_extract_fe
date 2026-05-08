import type { Configuration, PopupRequest } from '@azure/msal-browser';

// ─────────────────────────────────────────────────────────────────
// MODE SWITCH — TỰ ĐỘNG theo VITE_MSAL_TENANT_ID trong .env:
//
//   .env không có VITE_MSAL_TENANT_ID → DEV mode
//     authority: 'https://login.microsoftonline.com/common'
//     Login với personal Microsoft account (outlook/hotmail) hoặc work
//     Backend dùng ID token verify (vì personal access token là opaque)
//
//   .env có VITE_MSAL_TENANT_ID → PRODUCTION mode
//     authority: `https://login.microsoftonline.com/${TENANT_ID}`
//     Chỉ nhân viên của tenant đó login được
//     Backend dùng access token với custom BE scope (chuẩn OAuth2)
//     Cần IT admin của khách hàng grant consent 1 lần
// ─────────────────────────────────────────────────────────────────

export const IS_PRODUCTION = !!import.meta.env.VITE_MSAL_TENANT_ID;

const authority = IS_PRODUCTION
  ? `https://login.microsoftonline.com/${import.meta.env.VITE_MSAL_TENANT_ID as string}`
  : 'https://login.microsoftonline.com/common';

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MSAL_CLIENT_ID as string,
    authority,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

const BE_SCOPE = `api://${import.meta.env.VITE_MSAL_BE_CLIENT_ID as string}/access_as_user`;
const BASE_SCOPES = ['User.Read', 'Mail.ReadWrite'];

// Production phải request BE_SCOPE ngay khi login để user consent một lần
// Dev không request BE_SCOPE vì personal accounts không support custom API scope
export const loginRequest: PopupRequest = {
  scopes: IS_PRODUCTION ? [...BASE_SCOPES, BE_SCOPE] : BASE_SCOPES,
  prompt: 'select_account',
};

// Token gửi lên BE:
//   Dev: dùng Graph scope → idToken (JWT, hoạt động cả personal & work)
//   Prod: dùng custom BE scope → accessToken (chuẩn OAuth2)
export const beApiScopes: string[] = IS_PRODUCTION ? [BE_SCOPE] : ['User.Read'];
