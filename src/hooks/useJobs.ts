import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiJson } from '../lib/apiClient';
import { useAccessToken } from './useAccessToken';
import type { CreateJobResponse, JobSummary } from '../lib/types';

export function useJobs() {
  const getToken = useAccessToken();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiJson<{ jobs: JobSummary[] }>('/api/jobs', {}, getToken);
      setJobs(data.jobs);
    } finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const createJob = useCallback(async (file: File): Promise<CreateJobResponse> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await apiFetch('/api/jobs', { method: 'POST', body: fd }, getToken);
    const body = await res.json();
    await refresh();
    return body;
  }, [getToken, refresh]);

  const reprocess = useCallback(async (jobId: string) => {
    const r = await apiFetch(`/api/jobs/${jobId}/reprocess`, { method: 'POST' }, getToken);
    await refresh();
    return r.json();
  }, [getToken, refresh]);

  const deleteJob = useCallback(async (jobId: string) => {
    await apiFetch(`/api/jobs/${jobId}`, { method: 'DELETE' }, getToken);
    await refresh();
  }, [getToken, refresh]);

  return { jobs, loading, refresh, createJob, reprocess, deleteJob };
}
