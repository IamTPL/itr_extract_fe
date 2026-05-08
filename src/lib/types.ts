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
  analysis_data: Record<string, unknown> | null;
  email_html: string | null;
}

export interface CreateJobResponse {
  job_id: string;
  status: JobStatus;
  created_at: string;
}
