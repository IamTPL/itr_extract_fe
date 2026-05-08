import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { beApiScopes, IS_PRODUCTION, loginRequest } from '../lib/msalConfig';

export function useAccessToken() {
  const { instance, accounts } = useMsal();
  return async (): Promise<string> => {
    const account = accounts[0];
    if (!account) throw new Error('Not signed in');
    try {
      const result = await instance.acquireTokenSilent({ scopes: beApiScopes, account });
      // Production: accessToken với custom BE scope (proper JWT với aud=BE_CLIENT_ID)
      // Dev: idToken — luôn là JWT, hoạt động với cả personal và work accounts
      return IS_PRODUCTION ? result.accessToken : result.idToken;
    } catch (err) {
      // Token expired hoặc consent bị revoked → bắt buộc re-login
      if (err instanceof InteractionRequiredAuthError) {
        await instance.loginRedirect(loginRequest);
        // loginRedirect navigate trang đi → Promise này không bao giờ resolve
        throw err;
      }
      throw err;
    }
  };
}
