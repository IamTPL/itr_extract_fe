import type { JobStatus } from './constants';

export interface JobSummary {
  job_id: string;
  status: JobStatus;
  original_filename: string;
  created_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface JobDetail extends JobSummary {
  started_at: string | null;
  has_econsent: boolean;
  has_voucher: boolean;
  analysis_data: Record<string, unknown> | null;
  email_html: string | null;
}

export interface VoucherForm {
  form_number: string;
  title: string;
  pages: number[];
  jurisdiction: string;
  payment_type?: string;
  amount?: number | null;
  due_date?: string | null;
}

export interface CreateJobResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
}
