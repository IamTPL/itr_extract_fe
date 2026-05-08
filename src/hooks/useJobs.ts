import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiJson, ApiError } from '../lib/apiClient';
import { useToast } from '../lib/toast';
import { useAccessToken } from './useAccessToken';
import type { CreateJobResponse, JobSummary } from '../lib/types';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || `${fallback} (${err.status})`;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function useJobs() {
  const getToken = useAccessToken();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const toast = useToast();

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ jobs: JobSummary[] }>('/api/jobs', {}, getTokenRef.current);
      setJobs(data.jobs);
    } catch (err) {
      toast.show(errorMessage(err, 'Failed to load jobs'));
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { refresh(); }, [refresh]);

  const createJob = useCallback(async (file: File): Promise<CreateJobResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/jobs', { method: 'POST', body: fd }, getTokenRef.current);
    const body = await res.json();
    await refresh();
    return body;
  }, [refresh]);

  const reprocess = useCallback(async (jobId: string) => {
    try {
      const r = await apiFetch(`/api/jobs/${jobId}/reprocess`, { method: 'POST' }, getTokenRef.current);
      const body = await r.json();
      await refresh();
      return body;
    } catch (err) {
      toast.show(errorMessage(err, 'Failed to reprocess job'));
      throw err;
    }
  }, [refresh, toast]);

  const deleteJob = useCallback(async (jobId: string) => {
    try {
      await apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' }, getTokenRef.current);
      // Clear local edit cache (keyed bởi job_id trong JobDetailView)
      localStorage.removeItem(`itr.email_edit.${jobId}`);
      await refresh();
    } catch (err) {
      toast.show(errorMessage(err, 'Failed to delete job'));
      throw err;
    }
  }, [refresh, toast]);

  return { jobs, loading, refresh, createJob, reprocess, deleteJob };
}
