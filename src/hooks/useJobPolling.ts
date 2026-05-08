import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { useAccessToken } from './useAccessToken';
import { POLLING_INTERVAL_MS, POLLING_MAX_ATTEMPTS, TERMINAL_STATUSES } from '../lib/constants';
import type { JobDetail } from '../lib/types';

export function useJobPolling(jobId: string | null) {
  const getToken = useAccessToken();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!jobId) { setJob(null); setTimedOut(false); return; }
    let stopped = false;
    let attempts = 0;
    let timer: number | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const data = await apiJson<JobDetail>(`/api/jobs/${jobId}`, {}, getToken);
        setJob(data);
        attempts++;
        const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(data.status);
        if (isTerminal) return;
        if (attempts >= POLLING_MAX_ATTEMPTS) { setTimedOut(true); return; }
        timer = window.setTimeout(tick, POLLING_INTERVAL_MS);
      } catch {
        timer = window.setTimeout(tick, POLLING_INTERVAL_MS);
      }
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [jobId, getToken]);

  return { job, timedOut };
}
