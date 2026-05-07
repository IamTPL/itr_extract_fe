import type { IPublicClientApplication } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export interface DraftResult {
  id: string;
  webLink: string;
}

export async function createOutlookDraft(
  msalInstance: IPublicClientApplication,
  toEmail: string,
  subject: string,
  bodyHtml: string,
  econsentB64: string | null,
  econsentFileName: string,
): Promise<DraftResult> {
  const account = msalInstance.getAllAccounts()[0];

  // Thử lấy token silently (không cần user thao tác nếu token còn hạn)
  // Nếu hết hạn hoặc chưa có → mở popup để user đăng nhập lại
  let tokenResponse;
  try {
    tokenResponse = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  } catch {
    tokenResponse = await msalInstance.acquireTokenPopup(loginRequest);
  }

  const res = await fetch(`${GRAPH_API}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokenResponse.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject,
      body: { contentType: 'HTML', content: bodyHtml },
      toRecipients: [{ emailAddress: { address: toEmail } }],
      attachments: econsentB64 ? [
        {
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: econsentFileName,
          contentType: 'application/pdf',
          contentBytes: econsentB64,
        },
      ] : [],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `Graph API error ${res.status}`);
  }

  const draft = await res.json();
  return { id: draft.id, webLink: draft.webLink ?? '' };
}
