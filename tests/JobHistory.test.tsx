import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JobHistory } from '../src/components/JobHistory';
import { JobStatus } from '../src/lib/constants';
import type { JobSummary } from '../src/lib/types';

const jobs: JobSummary[] = [
  {
    job_id: 'alpha-job',
    status: JobStatus.SUCCESS,
    original_filename: 'Alpha Dental ITR 2025.pdf',
    created_at: '2026-07-14T04:25:07.763450Z',
    finished_at: '2026-07-14T04:25:17.358413Z',
    error_message: null,
  },
  {
    job_id: 'beta-job',
    status: JobStatus.SUCCESS,
    original_filename: 'Beta Holdings ITR 2025.pdf',
    created_at: '2026-07-14T04:26:07.763450Z',
    finished_at: '2026-07-14T04:26:17.358413Z',
    error_message: null,
  },
];

const baseProps = {
  jobs,
  selectedJobId: 'alpha-job',
  onSelect: vi.fn(),
  onReprocess: vi.fn(),
  onDelete: vi.fn(),
};

describe('JobHistory accountant workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads through the compact Process New PDF action', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<JobHistory {...baseProps} onUpload={onUpload} />);

    expect(screen.getByRole('button', { name: 'Process New PDF' })).toBeVisible();

    const pdf = new File(['pdf'], 'New Client ITR.pdf', { type: 'application/pdf' });
    await user.upload(screen.getByLabelText('Select PDF to process'), pdf);

    expect(onUpload).toHaveBeenCalledWith(pdf);
  });

  it('keeps drag-and-drop PDF upload on the compact upload area', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<JobHistory {...baseProps} onUpload={onUpload} />);

    const pdf = new File(['pdf'], 'Dropped Client ITR.pdf', { type: 'application/pdf' });
    const uploadArea = screen.getByRole('region', { name: 'PDF upload' });
    fireEvent.dragOver(uploadArea);
    fireEvent.drop(uploadArea, { dataTransfer: { files: [pdf] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(pdf));
  });

  it('filters returns by filename on the client', async () => {
    const user = userEvent.setup();
    render(<JobHistory {...baseProps} onUpload={vi.fn()} />);

    await user.type(screen.getByRole('searchbox', { name: 'Search returns' }), 'alpha');

    expect(screen.getByText('Alpha Dental ITR 2025.pdf')).toBeVisible();
    expect(screen.queryByText('Beta Holdings ITR 2025.pdf')).not.toBeInTheDocument();
  });

  it('keeps failed-job actions in an accessible three-dot disclosure', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReprocess = vi.fn().mockResolvedValue(undefined);
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const failedJob: JobSummary = {
      ...jobs[0],
      status: JobStatus.FAILED,
      error_message: 'Extraction failed',
    };

    render(
      <JobHistory
        {...baseProps}
        jobs={[failedJob]}
        onSelect={onSelect}
        onReprocess={onReprocess}
        onDelete={onDelete}
        onUpload={vi.fn()}
      />,
    );

    const actions = screen.getByRole('button', { name: `Actions for ${failedJob.original_filename}` });
    await user.click(actions);

    expect(screen.getByRole('button', { name: 'Reprocess' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reprocess' }));
    await waitFor(() => expect(onReprocess).toHaveBeenCalledWith(failedJob.job_id));

    await user.click(actions);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(failedJob.job_id));

    expect(confirm).toHaveBeenCalledWith(`Delete "${failedJob.original_filename}"? This cannot be undone.`);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('keeps keyboard menu actions separate from selecting the return', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onReprocess = vi.fn().mockResolvedValue(undefined);
    const failedJob: JobSummary = {
      ...jobs[0],
      status: JobStatus.FAILED,
      error_message: 'Extraction failed',
    };

    render(
      <JobHistory
        {...baseProps}
        jobs={[failedJob]}
        onSelect={onSelect}
        onReprocess={onReprocess}
        onUpload={vi.fn()}
      />,
    );

    const actions = screen.getByRole('button', { name: `Actions for ${failedJob.original_filename}` });
    actions.focus();
    await user.keyboard('{Enter}');

    const reprocess = screen.getByRole('button', { name: 'Reprocess' });
    await user.tab();
    expect(reprocess).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(actions).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Reprocess' })).not.toBeInTheDocument();

    await user.keyboard('{Enter}');
    await user.tab();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(onReprocess).toHaveBeenCalledWith(failedJob.job_id));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
