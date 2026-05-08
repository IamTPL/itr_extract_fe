import { JobStatusBadge } from './JobStatusBadge';
import type { JobSummary } from '../lib/types';
import { JobStatus, MAX_SESSIONS_PER_USER } from '../lib/constants';

interface Props {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onReprocess: (id: string) => void;
  onDelete: (id: string) => void;
}

export function JobHistory({ jobs, selectedJobId, onSelect, onReprocess, onDelete }: Props) {
  return (
    <aside style={{ borderLeft: '1px solid #ddd', padding: '12px', minWidth: 280 }}>
      <h3>History ({jobs.length}/{MAX_SESSIONS_PER_USER})</h3>
      {jobs.length === 0 && <p>Chưa có job.</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {jobs.map(j => (
          <li key={j.job_id}
              style={{ padding: 8, cursor: 'pointer',
                       background: j.job_id === selectedJobId ? '#eef' : 'transparent' }}
              onClick={() => onSelect(j.job_id)}>
            <div>{j.original_filename}</div>
            <JobStatusBadge status={j.status} />
            {j.status === JobStatus.FAILED && (
              <>
                <div style={{ fontSize: 12, color: '#c33' }}>{j.error_message}</div>
                <button onClick={(e) => { e.stopPropagation(); onReprocess(j.job_id); }}>Retry</button>
              </>
            )}
            <button onClick={(e) => { e.stopPropagation(); onDelete(j.job_id); }}
                    style={{ marginLeft: 8 }}>Xóa</button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
