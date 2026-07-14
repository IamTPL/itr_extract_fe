import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { JobStatus } from '../src/lib/constants';

const mocks = vi.hoisted(() => ({
  patchJob: vi.fn(),
  refresh: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock('@azure/msal-react', () => ({
  useIsAuthenticated: () => true,
  useMsal: () => ({
    instance: { clearCache: mocks.clearCache },
    accounts: [{ name: 'Test Accountant', username: 'accountant@example.com' }],
  }),
}));

vi.mock('../src/hooks/useJobs', () => ({
  useJobs: () => ({
    jobs: [{
      job_id: 'selected-job',
      status: JobStatus.PROCESSING,
      original_filename: 'selected-job.pdf',
      created_at: '2026-07-14T04:25:07.763450Z',
      finished_at: null,
      error_message: null,
    }],
    patchJob: mocks.patchJob,
    refresh: mocks.refresh,
    createJob: vi.fn(),
    reprocess: vi.fn(),
    deleteJob: vi.fn(),
  }),
}));

const completedDetail = {
  job_id: 'selected-job',
  status: JobStatus.SUCCESS,
  original_filename: 'selected-job.pdf',
  created_at: '2026-07-14T04:25:07.763450Z',
  started_at: '2026-07-14T04:25:08.763450Z',
  finished_at: '2026-07-14T04:25:17.358413Z',
  error_message: null,
  has_econsent: false,
  analysis_data: {},
  email_html: '<p>Ready</p>',
};

vi.mock('../src/hooks/useJobPolling', () => ({
  useJobPolling: () => ({ job: completedDetail, timedOut: false }),
}));

vi.mock('../src/components/JobDetailView', () => ({
  JobDetailView: () => <div>Completed return</div>,
}));

describe('App polling synchronization', () => {
  it('patches selected detail into the sidebar without refetching the list', async () => {
    render(<App />);

    await waitFor(() => expect(mocks.patchJob).toHaveBeenCalledWith(completedDetail));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
