import { JobStatus } from '../lib/constants';

const LABEL: Record<JobStatus, string> = {
  [JobStatus.PENDING]:    'Đang chờ',
  [JobStatus.PROCESSING]: 'Đang xử lý',
  [JobStatus.SUCCESS]:    'Hoàn tất',
  [JobStatus.FAILED]:     'Thất bại',
};
const COLOR: Record<JobStatus, string> = {
  [JobStatus.PENDING]:    '#888',
  [JobStatus.PROCESSING]: '#0a7',
  [JobStatus.SUCCESS]:    '#0a0',
  [JobStatus.FAILED]:     '#c33',
};

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span style={{ color: COLOR[status], fontWeight: 600 }}>
      {LABEL[status]}
    </span>
  );
}
