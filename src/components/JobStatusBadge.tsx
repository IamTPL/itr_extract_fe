import { JobStatus } from '../lib/constants';

const LABEL: Record<JobStatus, string> = {
  [JobStatus.PENDING]:    'Pending',
  [JobStatus.PROCESSING]: 'Processing',
  [JobStatus.SUCCESS]:    'Completed',
  [JobStatus.FAILED]:     'Failed',
};

const VARIANT: Record<JobStatus, string> = {
  [JobStatus.PENDING]:    'status-badge--muted',
  [JobStatus.PROCESSING]: 'status-badge--warning',
  [JobStatus.SUCCESS]:    'status-badge--success',
  [JobStatus.FAILED]:     'status-badge--error',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`status-badge ${VARIANT[status]}`}>
      <span className="status-badge__dot" />
      {LABEL[status]}
    </span>
  );
}
