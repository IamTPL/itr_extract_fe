import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobDetailView } from '../src/components/JobDetailView';
import { JobStatus } from '../src/lib/constants';
import type { JobDetail } from '../src/lib/types';
import { ToastProvider } from '../src/lib/toast';

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {},
    accounts: [],
  }),
}));

const job: JobDetail = {
  job_id: 'alpha-job',
  status: JobStatus.SUCCESS,
  original_filename: 'Alpha Dental ITR 2025.pdf',
  created_at: '2026-07-14T04:25:07.763450Z',
  started_at: '2026-07-14T04:25:08.763450Z',
  finished_at: '2026-07-14T04:25:17.358413Z',
  error_message: null,
  has_econsent: false,
  analysis_data: {
    client: { name: 'Alpha Dental LLC' },
    tax_year: '2025',
    return_type: 'Business (1120-S)',
    econsent_forms: [
      {
        form_number: '8879-S',
        title: 'IRS e-file Signature Authorization',
        jurisdiction: 'Federal',
        pages: [7],
      },
    ],
  },
  email_html: '<p>Dear Client,</p><p>Your return is ready.</p>',
};

function renderDetail() {
  return render(
    <ToastProvider>
      <JobDetailView job={job} />
    </ToastProvider>,
  );
}

describe('JobDetailView accountant workspace', () => {
  it('presents Email Preview as a named workspace section', () => {
    renderDetail();

    expect(screen.getByRole('heading', { name: 'Email Preview' })).toBeVisible();
  });

  it('names the Outlook workflow Prepare Outlook Draft', () => {
    renderDetail();

    expect(screen.getByRole('heading', { name: 'Prepare Outlook Draft' })).toBeVisible();
  });

  it('explains that preparing a draft never sends mail automatically', () => {
    renderDetail();

    expect(screen.getByText('Creates a draft only — nothing is sent automatically.')).toBeVisible();
  });

  it('preserves both existing draft delivery modes', () => {
    renderDetail();

    expect(screen.getByRole('radio', { name: /^One email/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Two emails/ })).toBeInTheDocument();
  });

  it('runs editor formatting commands from the keyboard', async () => {
    const user = userEvent.setup();
    const execCommand = vi.fn();
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    renderDetail();

    const bold = screen.getByRole('button', { name: 'Bold' });
    bold.focus();
    await user.keyboard('{Enter}');

    expect(execCommand).toHaveBeenCalledWith('bold', false);
  });
});
