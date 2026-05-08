import { useEffect, useRef, useState } from 'react';
import { apiJson, ApiError } from '../lib/apiClient';
import { useAccessToken } from './useAccessToken';
import { POLLING_INTERVAL_MS, POLLING_MAX_ATTEMPTS, TERMINAL_STATUSES } from '../lib/constants';
import type { JobDetail } from '../lib/types';

const ERROR_BACKOFF_MAX_MS = 30_000;

export function useJobPolling(jobId: string | null, key = 0) {
  const getToken = useAccessToken();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [job, setJob] = useState<JobDetail | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!jobId) { setJob(null); setTimedOut(false); return; }
    setJob(null);
    setTimedOut(false);
    let stopped = false;
    let attempts = 0;
    let consecutiveErrors = 0;
    let timer: number | null = null;

    const tick = async () => {
      if (stopped) return;
      try {
        const data = await apiJson<JobDetail>(`/api/jobs/${jobId}`, {}, getTokenRef.current);
        if (stopped) return;
        setJob(data);
        attempts++;
        consecutiveErrors = 0;
        const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(data.status);
        if (isTerminal) return;
        if (attempts >= POLLING_MAX_ATTEMPTS) { setTimedOut(true); return; }
        timer = window.setTimeout(tick, POLLING_INTERVAL_MS);
      } catch (err) {
        if (stopped) return;
        // Job bị delete trong lúc polling → 404 → dừng poll, clear state
        if (err instanceof ApiError && err.status === 404) {
          setJob(null);
          return;
        }
        attempts++;
        consecutiveErrors++;
        if (attempts >= POLLING_MAX_ATTEMPTS) { setTimedOut(true); return; }
        // Exponential backoff khi lặp lỗi: 1×, 2×, 4×, 8× của interval (cap 30s).
        // Tránh hammer backend khi nó đang chết.
        const delay = Math.min(
          POLLING_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1),
          ERROR_BACKOFF_MAX_MS,
        );
        timer = window.setTimeout(tick, delay);
      }
    };
    tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [jobId, key]); // key cho phép restart polling từ bên ngoài

  return { job, timedOut };
}
