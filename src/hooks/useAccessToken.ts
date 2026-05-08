import { useMsal } from '@azure/msal-react';
import { beApiScopes } from '../lib/msalConfig';

export function useAccessToken() {
  const { instance, accounts } = useMsal();
  return async (): Promise<string> => {
    const account = accounts[0];
    if (!account) throw new Error('Not signed in');
    const result = await instance.acquireTokenSilent({ scopes: beApiScopes, account });
    return result.accessToken;
  };
}
