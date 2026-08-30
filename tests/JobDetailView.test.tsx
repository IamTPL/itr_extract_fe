import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { JobDetailView, formatVoucherDueDate } from '../src/components/JobDetailView';
import { JobStatus } from '../src/lib/constants';
import type { JobDetail } from '../src/lib/types';
import { ToastProvider } from '../src/lib/toast';

vi.mock('@azure/msal-react', () => ({
  useMsal: () => ({
    instance: {},
    accounts: [],
  }),
}));

// Econsent/Voucher PDF fetch effects gọi apiFetch — mock để không đụng network thật
// trong test (job voucher ở dưới có has_voucher: true nên effect này thực sự chạy).
vi.mock('../src/lib/apiClient', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    arrayBuffer: async () => new ArrayBuffer(0),
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
  has_voucher: false,
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

// Payload thật của Kramer (sample "Kramer example full pages.pdf", trang 8 = Form 1040-V)
const jobWithVoucher: JobDetail = {
  ...job,
  job_id: 'kramer-job',
  has_voucher: true,
  analysis_data: {
    ...job.analysis_data,
    voucher_forms: [
      {
        form_number: '1040-V',
        title: 'Payment Voucher',
        jurisdiction: 'Federal',
        pages: [8],
        payment_type: 'balance_due',
        amount: 130828,
        due_date: '08/26/2026',
      },
    ],
  },
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

  it('does not render the Payment Vouchers panel or the Attach Voucher.pdf checkbox for a job without a voucher', () => {
    renderDetail();

    expect(screen.queryByRole('heading', { name: 'Payment Vouchers' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Attach Voucher\.pdf/ })).not.toBeInTheDocument();
  });

  it('renders the Payment Vouchers panel with the Kramer voucher payload and an unchecked Attach Voucher.pdf checkbox', async () => {
    render(
      <ToastProvider>
        <JobDetailView job={jobWithVoucher} />
      </ToastProvider>,
    );

    const heading = await screen.findByRole('heading', { name: 'Payment Vouchers' });
    const panel = heading.closest('.prepare-section');
    expect(panel).not.toBeNull();

    expect(within(panel as HTMLElement).getByText('Form 1040-V')).toBeVisible();
    expect(within(panel as HTMLElement).getByText('Federal')).toBeVisible();
    expect(within(panel as HTMLElement).getByText('$130,828.00 • Due Aug 26, 2026')).toBeVisible();

    const attachVoucherCheckbox = screen.getByRole('checkbox', { name: /Attach Voucher\.pdf/ });
    expect(attachVoucherCheckbox).not.toBeChecked();
  });
});

describe('formatVoucherDueDate', () => {
  it('formats a valid MM/DD/YYYY date', () => {
    expect(formatVoucherDueDate('08/26/2026')).toBe('Aug 26, 2026');
  });

  it('returns null instead of throwing for unparsable input', () => {
    expect(formatVoucherDueDate('TBD')).toBeNull();
    expect(formatVoucherDueDate('')).toBeNull();
  });
});
