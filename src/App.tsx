import { useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { UploadCard } from './components/UploadCard';
import { JobHistory } from './components/JobHistory';
import { JobDetailView } from './components/JobDetailView';
import { JobStatusBadge } from './components/JobStatusBadge';
import { useJobs } from './hooks/useJobs';
import { useJobPolling } from './hooks/useJobPolling';
import { JobStatus } from './lib/constants';
import { loginRequest } from './lib/msalConfig';

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="login-gate">
      <div className="login-card">
        <div className="login-card__icon">📊</div>
        <h1 className="login-card__title">ITR Extract</h1>
        <p className="login-card__subtitle">Sign in with your Microsoft 365 account to continue</p>
        <button
          onClick={onLogin}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" width={16} height={16} alt="" />
          Sign in with Microsoft 365
        </button>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { instance, accounts } = useMsal();
  const { jobs, createJob, reprocess, deleteJob } = useJobs();
  const [selected, setSelected] = useState<string | null>(null);
  const [pollingKey, setPollingKey] = useState(0);
  const { job, timedOut } = useJobPolling(selected, pollingKey);

  const isPending = job?.status === JobStatus.PENDING || job?.status === JobStatus.PROCESSING;
  const userName = accounts[0]?.name ?? accounts[0]?.username ?? 'User';

  async function handleLogout() {
    await instance.logoutRedirect({ postLogoutRedirectUri: window.location.origin });
  }

  return (
    <div className="app-shell">
      <JobHistory
        jobs={jobs}
        selectedJobId={selected}
        onSelect={setSelected}
        onReprocess={async (id) => {
          try {
            const r = await reprocess(id);
            setSelected(r.job_id);
          } catch { /* toast already shown */ }
        }}
        onDelete={async (id) => {
          try {
            await deleteJob(id);
            if (selected === id) setSelected(null);
          } catch { /* toast already shown */ }
        }}
      />
      <div className="main">
        <header className="header">
          <span className="header__username">{userName}</span>
          <button className="btn btn-ghost" onClick={handleLogout}>Sign out</button>
        </header>
        <div className="content">
          <UploadCard onUpload={async (file) => {
            const r = await createJob(file);
            setSelected(r.job_id);
          }} />

          {isPending && job && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <JobStatusBadge status={job.status} />
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>{job.original_filename}</span>
            </div>
          )}

          {job?.status === JobStatus.FAILED && (
            <div style={{ marginBottom: '1rem', color: 'var(--color-error)', fontSize: '0.88rem' }}>
              Failed: {job.error_message}
            </div>
          )}

          {timedOut && (
            <div style={{ marginBottom: '1rem', fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>
              Processing is taking a while.{' '}
              <button className="btn btn-ghost" onClick={() => setPollingKey(k => k + 1)}>
                Refresh to check
              </button>
            </div>
          )}

          {job?.status === JobStatus.SUCCESS && <JobDetailView job={job} />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  async function handleLogin() {
    await instance.loginRedirect(loginRequest);
  }

  if (!isAuthenticated) return <LoginGate onLogin={handleLogin} />;
  return <AuthenticatedApp />;
}
