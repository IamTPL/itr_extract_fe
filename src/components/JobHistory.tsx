import { useState } from 'react';
import { JobStatusBadge } from './JobStatusBadge';
import type { JobSummary } from '../lib/types';
import { JobStatus, MAX_SESSIONS_PER_USER } from '../lib/constants';

interface Props {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onReprocess: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export function JobHistory({ jobs, selectedJobId, onSelect, onReprocess, onDelete }: Props) {
  const [pending, setPending] = useState<Record<string, 'reprocess' | 'delete' | undefined>>({});

  async function handleReprocess(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    if (pending[jobId]) return;
    setPending(prev => ({ ...prev, [jobId]: 'reprocess' }));
    try { await onReprocess(jobId); }
    finally { setPending(prev => ({ ...prev, [jobId]: undefined })); }
  }

  async function handleDelete(e: React.MouseEvent, jobId: string, fileName: string) {
    e.stopPropagation();
    if (pending[jobId]) return;
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setPending(prev => ({ ...prev, [jobId]: 'delete' }));
    try { await onDelete(jobId); }
    finally { setPending(prev => ({ ...prev, [jobId]: undefined })); }
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__logo">ITR Extract</div>
      <div className="sidebar__count">History ({jobs.length}/{MAX_SESSIONS_PER_USER})</div>
      <ul className="sidebar__list">
        {jobs.length === 0 && (
          <li className="sidebar__empty">No jobs yet.</li>
        )}
        {jobs.map(j => {
          const action = pending[j.job_id];
          const isSelected = j.job_id === selectedJobId;
          return (
            <li
              key={j.job_id}
              className={`job-item${isSelected ? ' job-item--selected' : ''}`}
              onClick={() => onSelect(j.job_id)}
            >
              <div className="job-item__filename" title={j.original_filename}>
                {j.original_filename}
              </div>
              <JobStatusBadge status={j.status} />
              {j.status === JobStatus.FAILED && (
                <button
                  className="job-item__reprocess"
                  onClick={e => handleReprocess(e, j.job_id)}
                  disabled={!!action}
                >
                  {action === 'reprocess' ? 'Reprocessing…' : 'Reprocess'}
                </button>
              )}
              <button
                className="job-item__delete"
                onClick={e => handleDelete(e, j.job_id, j.original_filename)}
                disabled={!!action}
                title="Delete"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
