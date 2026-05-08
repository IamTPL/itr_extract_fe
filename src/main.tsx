import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './lib/msalConfig';
import { ToastProvider } from './lib/toast';
import App from './App.tsx';
import './index.css';

const msalInstance = new PublicClientApplication(msalConfig);

msalInstance.initialize().then(async () => {
  // Xử lý auth code trả về sau khi Microsoft redirect về app.
  // Phải gọi trước khi render để MSAL lưu token vào sessionStorage.
  await msalInstance.handleRedirectPromise();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </MsalProvider>
    </StrictMode>,
  );
});
