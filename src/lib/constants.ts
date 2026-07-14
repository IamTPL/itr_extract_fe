export const POLLING_INTERVAL_MS    = 2000;
export const POLLING_MAX_ATTEMPTS   = 150;
export const POLLING_LONG_RUNNING_INTERVAL_MS = 15_000;
export const JOB_LIST_POLL_INTERVAL_MS = 3_000;
export const JOB_LIST_POLL_MAX_BACKOFF_MS = 30_000;
export const MAX_SESSIONS_PER_USER  = 10;
export const MAX_FILE_SIZE_BYTES    = 50 * 1024 * 1024;

export const JobStatus = {
  PENDING:    'pending',
  PROCESSING: 'processing',
  SUCCESS:    'success',
  FAILED:     'failed',
} as const;
export type JobStatus = typeof JobStatus[keyof typeof JobStatus];

export const TERMINAL_STATUSES: ReadonlyArray<JobStatus> =
  [JobStatus.SUCCESS, JobStatus.FAILED];
export const ACTIVE_STATUSES: ReadonlyArray<JobStatus> =
  [JobStatus.PENDING, JobStatus.PROCESSING];
