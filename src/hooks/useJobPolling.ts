import { useEffect, useRef, useState } from 'react';
import { apiJson, ApiError } from '../lib/apiClient';
import { useAccessToken } from './useAccessToken';
import {
  POLLING_INTERVAL_MS,
  POLLING_LONG_RUNNING_INTERVAL_MS,
  POLLING_MAX_ATTEMPTS,
  TERMINAL_STATUSES,
} from '../lib/constants';
import type { JobDetail } from '../lib/types';

const ERROR_BACKOFF_MAX_MS = 30_000;

export function useJobPolling(jobId: string | null, key = 0) {
  const getToken = useAccessToken();
  const getTokenRef = useRef(getToken);
  const identity = jobId ? `${jobId}:${key}` : '';
  const [snapshot, setSnapshot] = useState<{
    identity: string;
    job: JobDetail | null;
    timedOut: boolean;
  }>({ identity: '', job: null, timedOut: false });

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    if (!jobId) return;

    let stopped = false;
    let attempts = 0;
    let consecutiveErrors = 0;
    let timer: number | null = null;
    let inFlight = false;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const isHidden = () => document.visibilityState === 'hidden';

    const schedule = (delay: number) => {
      clearTimer();
      if (stopped || isHidden()) return;
      timer = window.setTimeout(() => {
        timer = null;
        void tick(false);
      }, delay);
    };

    const tick = async (allowHidden: boolean) => {
      if (stopped || inFlight || (!allowHidden && isHidden())) return;
      inFlight = true;
      let nextDelay: number | null = null;

      try {
        const data = await apiJson<JobDetail>(`/api/jobs/${jobId}`, {}, getTokenRef.current);
        if (stopped) return;
        attempts++;
        consecutiveErrors = 0;
        const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(data.status);
        const isLongRunning = attempts >= POLLING_MAX_ATTEMPTS;
        setSnapshot({
          identity,
          job: data,
          timedOut: isLongRunning && !isTerminal,
        });
        if (!isTerminal) {
          nextDelay = isLongRunning
            ? POLLING_LONG_RUNNING_INTERVAL_MS
            : POLLING_INTERVAL_MS;
        }
      } catch (err) {
        if (stopped) return;
        // Job bị delete trong lúc polling → 404 → dừng poll, clear state
        if (err instanceof ApiError && err.status === 404) {
          setSnapshot({ identity, job: null, timedOut: false });
          return;
        }
        attempts++;
        consecutiveErrors++;
        // Exponential backoff khi lặp lỗi: 1×, 2×, 4×, 8× của interval (cap 30s).
        // Tránh hammer backend khi nó đang chết.
        const errorDelay = Math.min(
          POLLING_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1),
          ERROR_BACKOFF_MAX_MS,
        );
        const isLongRunning = attempts >= POLLING_MAX_ATTEMPTS;
        if (isLongRunning) {
          setSnapshot(previous => ({
            identity,
            job: previous.identity === identity ? previous.job : null,
            timedOut: true,
          }));
        }
        nextDelay = isLongRunning
          ? Math.max(POLLING_LONG_RUNNING_INTERVAL_MS, errorDelay)
          : errorDelay;
      } finally {
        inFlight = false;
        if (!stopped && nextDelay !== null && !isHidden()) schedule(nextDelay);
      }
    };

    const handleVisibilityChange = () => {
      clearTimer();
      if (!isHidden() && !inFlight) schedule(0);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void tick(true);

    return () => {
      stopped = true;
      clearTimer();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [identity, jobId, key]); // key cho phép restart polling từ bên ngoài

  if (snapshot.identity !== identity) return { job: null, timedOut: false };
  return { job: snapshot.job, timedOut: snapshot.timedOut };
}
