import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiJson, ApiError } from '../lib/apiClient';
import { useToast } from '../lib/toast';
import { useAccessToken } from './useAccessToken';
import {
  ACTIVE_STATUSES,
  JOB_LIST_POLL_INTERVAL_MS,
  JOB_LIST_POLL_MAX_BACKOFF_MS,
  JobStatus,
} from '../lib/constants';
import type { CreateJobResponse, JobSummary } from '../lib/types';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || `${fallback} (${err.status})`;
  if (err instanceof Error) return err.message;
  return fallback;
}

const STATUS_RANK: Record<JobSummary['status'], number> = {
  [JobStatus.PENDING]: 0,
  [JobStatus.PROCESSING]: 1,
  [JobStatus.SUCCESS]: 2,
  [JobStatus.FAILED]: 2,
};

function sameSummary(left: JobSummary, right: JobSummary): boolean {
  return (
    left.job_id === right.job_id
    && left.status === right.status
    && left.original_filename === right.original_filename
    && left.created_at === right.created_at
    && left.finished_at === right.finished_at
    && left.error_message === right.error_message
  );
}

function mergeMonotonic(current: JobSummary, incoming: JobSummary): JobSummary {
  if (STATUS_RANK[incoming.status] >= STATUS_RANK[current.status]) return incoming;
  return {
    ...incoming,
    status: current.status,
    finished_at: current.finished_at,
    error_message: current.error_message,
  };
}

function mergeServerJobs(current: JobSummary[], incoming: JobSummary[]): JobSummary[] {
  const currentById = new Map(current.map(job => [job.job_id, job]));
  const merged = incoming.map(job => {
    const existing = currentById.get(job.job_id);
    return existing ? mergeMonotonic(existing, job) : job;
  });

  if (
    merged.length === current.length
    && merged.every((job, index) => sameSummary(job, current[index]))
  ) {
    return current;
  }
  return merged;
}

function isActive(status: JobSummary['status']): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function useJobs(selectedJobId: string | null = null) {
  const getToken = useAccessToken();
  const getTokenRef = useRef(getToken);
  const toast = useToast();

  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestJobs = useCallback((): Promise<void> => {
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      const data = await apiJson<{ jobs: JobSummary[] }>('/api/jobs', {}, getTokenRef.current);
      if (mountedRef.current) {
        setJobs(current => mergeServerJobs(current, data.jobs));
      }
    })();

    inFlightRef.current = request;
    const clearInFlight = () => {
      if (inFlightRef.current === request) inFlightRef.current = null;
    };
    void request.then(clearInFlight, clearInFlight);
    return request;
  }, []);

  const requestFreshJobs = useCallback(async () => {
    const activeRequest = inFlightRef.current;
    if (activeRequest) {
      try {
        await activeRequest;
      } catch {
        // A fresh request below supersedes the failed/stale in-flight request.
      }
    }
    await requestJobs();
  }, [requestJobs]);

  const refresh = useCallback(async () => {
    try {
      await requestFreshJobs();
    } catch (err) {
      toast.show(errorMessage(err, 'Failed to load jobs'));
    }
  }, [requestFreshJobs, toast]);

  const patchJob = useCallback((incoming: JobSummary) => {
    setJobs(current => {
      const index = current.findIndex(job => job.job_id === incoming.job_id);
      if (index === -1) return [incoming, ...current];

      const merged = mergeMonotonic(current[index], incoming);
      if (sameSummary(current[index], merged)) return current;
      const next = [...current];
      next[index] = merged;
      return next;
    });
  }, []);

  useEffect(() => {
    void requestJobs().catch(err => {
      toast.show(errorMessage(err, 'Failed to load jobs'));
    });
  }, [requestJobs, toast]);

  const activeUnselectedKey = jobs
    .filter(job => job.job_id !== selectedJobId && isActive(job.status))
    .map(job => job.job_id)
    .sort()
    .join('|');

  useEffect(() => {
    if (!activeUnselectedKey) return;

    let cancelled = false;
    let timer: number | null = null;
    let consecutiveErrors = 0;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const isHidden = () => document.visibilityState === 'hidden';

    const schedule = (delay: number) => {
      clearTimer();
      if (cancelled || isHidden()) return;
      timer = window.setTimeout(() => {
        timer = null;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (cancelled || isHidden()) return;
      try {
        await requestJobs();
        consecutiveErrors = 0;
      } catch {
        consecutiveErrors += 1;
      }
      if (cancelled || isHidden()) return;

      const delay = consecutiveErrors === 0
        ? JOB_LIST_POLL_INTERVAL_MS
        : Math.min(
            JOB_LIST_POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1),
            JOB_LIST_POLL_MAX_BACKOFF_MS,
          );
      schedule(delay);
    };

    const handleVisibilityChange = () => {
      clearTimer();
      if (!isHidden()) schedule(0);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    schedule(JOB_LIST_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeUnselectedKey, requestJobs]);

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

  return { jobs, refresh, patchJob, createJob, reprocess, deleteJob };
}
