import { useState } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { UploadCard } from './components/UploadCard';
import { JobHistory } from './components/JobHistory';
import { JobDetailView } from './components/JobDetailView';
import { JobStatusBadge } from './components/JobStatusBadge';
import { useJobs } from './hooks/useJobs';
import { useJobPolling } from './hooks/useJobPolling';
import { JobStatus } from './lib/constants';
import { loginRequest, popupRedirectUri } from './lib/msalConfig';

function LoginGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7fa' }}>
      <div style={{ textAlign: 'center', width: '380px' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: '#1a1a2e', marginBottom: '0.5rem' }}>ITR Extract</h1>
        <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.95rem' }}>Sign in with your Microsoft 365 account to continue</p>
        <button
          onClick={onLogin}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 1.6rem', borderRadius: '6px', border: 'none', background: '#0078d4', color: '#fff', fontWeight: 600, fontSize: '0.95rem', cursor: 'pointer' }}
        >
          <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" width={16} height={16} alt="" />
          Sign in with Microsoft 365
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { instance } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const { jobs, createJob, reprocess, deleteJob } = useJobs();
  const [selected, setSelected] = useState<string | null>(null);
  const { job, timedOut } = useJobPolling(selected);

  async function handleLogin() {
    await instance.loginPopup({ ...loginRequest, redirectUri: popupRedirectUri });
  }

  if (!isAuthenticated) return <LoginGate onLogin={handleLogin} />;

  const isPending = job?.status === JobStatus.PENDING || job?.status === JobStatus.PROCESSING;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f7fa' }}>
      <main style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
        <UploadCard onUpload={async (file) => {
          const r = await createJob(file);
          setSelected(r.job_id);
        }} />

        {isPending && job && (
          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <JobStatusBadge status={job.status} />
            <span style={{ color: '#666', fontSize: '0.9rem' }}>{job.original_filename}</span>
          </div>
        )}

        {job?.status === JobStatus.FAILED && (
          <div style={{ marginTop: '1rem', color: '#c33' }}>Failed: {job.error_message}</div>
        )}

        {timedOut && (
          <div style={{ marginTop: '1rem' }}>
            Processing is taking a while.{' '}
            <button onClick={() => setSelected(selected)}>Refresh to check</button>
          </div>
        )}

        {job?.status === JobStatus.SUCCESS && <JobDetailView job={job} />}
      </main>

      <JobHistory
        jobs={jobs}
        selectedJobId={selected}
        onSelect={setSelected}
        onReprocess={async (id) => { const r = await reprocess(id); setSelected(r.job_id); }}
        onDelete={async (id) => { await deleteJob(id); if (selected === id) setSelected(null); }}
      />
    </div>
  );
}
