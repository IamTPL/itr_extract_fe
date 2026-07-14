import { useRef, useState } from 'react';
import { FileText, MoreHorizontal, RotateCw, Search, Trash2 } from 'lucide-react';
import { JobStatusBadge } from './JobStatusBadge';
import { UploadCard } from './UploadCard';
import type { JobSummary } from '../lib/types';
import { JobStatus, MAX_SESSIONS_PER_USER } from '../lib/constants';

interface Props {
  jobs: JobSummary[];
  selectedJobId: string | null;
  onSelect: (id: string) => void;
  onReprocess: (id: string) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onUpload: (file: File) => Promise<void>;
}

export function JobHistory({ jobs, selectedJobId, onSelect, onReprocess, onDelete, onUpload }: Props) {
  const [pending, setPending] = useState<Record<string, 'reprocess' | 'delete' | undefined>>({});
  const [query, setQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const openMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredJobs = normalizedQuery
    ? jobs.filter(job => job.original_filename.toLocaleLowerCase().includes(normalizedQuery))
    : jobs;

  async function handleReprocess(e: React.MouseEvent, jobId: string) {
    e.stopPropagation();
    if (pending[jobId]) return;
    setOpenMenuId(null);
    setPending(prev => ({ ...prev, [jobId]: 'reprocess' }));
    try { await onReprocess(jobId); }
    finally { setPending(prev => ({ ...prev, [jobId]: undefined })); }
  }

  async function handleDelete(e: React.MouseEvent, jobId: string, fileName: string) {
    e.stopPropagation();
    if (pending[jobId]) return;
    if (!window.confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    setOpenMenuId(null);
    setPending(prev => ({ ...prev, [jobId]: 'delete' }));
    try { await onDelete(jobId); }
    finally { setPending(prev => ({ ...prev, [jobId]: undefined })); }
  }

  return (
    <aside className="sidebar" onKeyDown={e => {
      if (e.key === 'Escape' && openMenuId) {
        e.preventDefault();
        setOpenMenuId(null);
        openMenuTriggerRef.current?.focus();
      }
    }}>
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true"><FileText size={19} /></span>
        <div>
          <div className="sidebar__logo">ITR Extract</div>
          <div className="sidebar__tagline">Tax return workspace</div>
        </div>
      </div>

      <UploadCard onUpload={onUpload} />

      <div className="sidebar__history-header">
        <div className="sidebar__count">Client returns</div>
        <span className="sidebar__limit">{jobs.length}/{MAX_SESSIONS_PER_USER}</span>
      </div>
      <label className="sidebar__search">
        <Search className="sidebar__search-icon" size={16} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Search returns"
          placeholder="Search returns"
        />
      </label>
      <ul className="sidebar__list">
        {jobs.length === 0 && (
          <li className="sidebar__empty">No jobs yet.</li>
        )}
        {jobs.length > 0 && filteredJobs.length === 0 && (
          <li className="sidebar__empty">No matching returns.</li>
        )}
        {filteredJobs.map(j => {
          const action = pending[j.job_id];
          const isSelected = j.job_id === selectedJobId;
          const isMenuOpen = openMenuId === j.job_id;
          return (
            <li
              key={j.job_id}
              className={`job-item${isSelected ? ' job-item--selected' : ''}${isMenuOpen ? ' job-item--menu-open' : ''}`}
            >
              <button
                type="button"
                className="job-item__select"
                aria-current={isSelected ? 'page' : undefined}
                onClick={() => {
                  setOpenMenuId(null);
                  onSelect(j.job_id);
                }}
              >
                <div className="job-item__title-row">
                  <FileText size={15} aria-hidden="true" />
                  <div className="job-item__filename" title={j.original_filename}>
                    {j.original_filename}
                  </div>
                </div>
                <div className="job-item__meta">
                  <JobStatusBadge status={j.status} />
                  <span className="job-item__time">
                    {new Date(j.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              </button>
              <button
                type="button"
                className="job-item__menu-trigger"
                aria-label={`Actions for ${j.original_filename}`}
                aria-expanded={isMenuOpen}
                aria-controls={isMenuOpen ? `job-actions-${j.job_id}` : undefined}
                onClick={e => {
                  e.stopPropagation();
                  openMenuTriggerRef.current = e.currentTarget;
                  setOpenMenuId(current => current === j.job_id ? null : j.job_id);
                }}
                disabled={!!action}
              >
                <MoreHorizontal size={17} aria-hidden="true" />
              </button>
              {isMenuOpen && (
                <div
                  id={`job-actions-${j.job_id}`}
                  className="job-item__menu"
                  role="group"
                  aria-label={`Return actions for ${j.original_filename}`}
                >
                  {j.status === JobStatus.FAILED && (
                    <button
                      type="button"
                      onClick={e => handleReprocess(e, j.job_id)}
                      disabled={!!action}
                    >
                      <RotateCw size={14} aria-hidden="true" />
                      {action === 'reprocess' ? 'Reprocessing…' : 'Reprocess'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="job-item__menu-delete"
                    onClick={e => handleDelete(e, j.job_id, j.original_filename)}
                    disabled={!!action}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    {action === 'delete' ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
