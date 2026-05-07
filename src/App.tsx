import { useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import type { IPublicClientApplication } from '@azure/msal-browser';
import type { ProcessResponse } from './types';
import { loginRequest } from './lib/msalConfig';
import UploadZone from './components/UploadZone';
import ProcessingState from './components/ProcessingState';
import ResultPanel from './components/ResultPanel';

type AppState = 'idle' | 'processing' | 'done' | 'error';

const API_BASE = 'http://localhost:8000';

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div style={{ textAlign: 'center', width: '380px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.5rem' }}>
          ITR Extract
        </h1>
        <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.95rem' }}>
          Sign in with your Microsoft 365 account to continue
        </p>
        <button
          onClick={onLogin}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.7rem 1.6rem', borderRadius: '6px', border: 'none',
            background: '#0078d4', color: '#fff', fontWeight: 600,
            fontSize: '0.95rem', cursor: 'pointer',
          }}
        >
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg"
            width={16} height={16} alt=""
          />
          Sign in with Microsoft 365
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [state, setState] = useState<AppState>('idle');
  const [result, setResult] = useState<ProcessResponse | null>(null);
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [error, setError] = useState('');

  async function handleLogin() {
    await instance.loginRedirect(loginRequest);
  }

  async function handleFile(file: File) {
    setState('processing');
    setError('');
    setOriginalFile(file);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/process`, { method: 'POST', body: form });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(j.detail ?? `Server error ${res.status}`);
      }
      setResult(await res.json());
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }

  function handleReset() {
    setResult(null);
    setOriginalFile(null);
    setState('idle');
  }

  if (!isAuthenticated)
    return <LoginGate onLogin={handleLogin} />;

  if (state === 'idle' || state === 'error')
    return <UploadZone onFile={handleFile} error={error} />;

  if (state === 'processing')
    return <ProcessingState />;

  if (state === 'done' && result && originalFile)
    return (
      <ResultPanel
        result={result}
        originalFile={originalFile}
        msalInstance={instance as IPublicClientApplication}
        onReset={handleReset}
      />
    );

  return null;
}
