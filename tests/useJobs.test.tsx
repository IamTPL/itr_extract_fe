import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobs } from '../src/hooks/useJobs';
import { JobStatus } from '../src/lib/constants';
import type { CreateJobResponse, JobSummary } from '../src/lib/types';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  apiJson: vi.fn(),
  getToken: vi.fn(async () => 'token'),
  toast: { show: vi.fn() },
}));

vi.mock('../src/lib/apiClient', () => {
  class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    ApiError,
    apiFetch: mocks.apiFetch,
    apiJson: mocks.apiJson,
  };
});

vi.mock('../src/hooks/useAccessToken', () => ({
  useAccessToken: () => mocks.getToken,
}));

vi.mock('../src/lib/toast', () => ({
  useToast: () => mocks.toast,
}));

const POLL_MS = 3_000;

function summary(jobId: string, status: JobSummary['status']): JobSummary {
  const terminal = status === JobStatus.SUCCESS || status === JobStatus.FAILED;
  return {
    job_id: jobId,
    status,
    original_filename: `${jobId}.pdf`,
    created_at: '2026-07-14T04:25:07.763450Z',
    finished_at: terminal ? '2026-07-14T04:25:17.358413Z' : null,
    error_message: status === JobStatus.FAILED ? 'Failed' : null,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  Object.defineProperty(document, 'hidden', { configurable: true, value: state === 'hidden' });
}

describe('useJobs status synchronization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setVisibility('visible');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    setVisibility('visible');
  });

  it('patches the selected job locally without polling the whole list', async () => {
    mocks.apiJson.mockResolvedValueOnce({
      jobs: [summary('selected-job', JobStatus.PROCESSING)],
    });

    const { result } = renderHook(() => useJobs('selected-job'));
    await flushPromises();

    expect(mocks.apiJson).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.patchJob(summary('selected-job', JobStatus.SUCCESS));
    });
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 5));

    expect(result.current.jobs[0].status).toBe(JobStatus.SUCCESS);
    expect(mocks.apiJson).toHaveBeenCalledTimes(1);
  });

  it('polls active unselected jobs and stops after they become terminal', async () => {
    mocks.apiJson
      .mockResolvedValueOnce({
        jobs: [
          summary('selected-job', JobStatus.SUCCESS),
          summary('background-job', JobStatus.PROCESSING),
        ],
      })
      .mockResolvedValueOnce({
        jobs: [
          summary('selected-job', JobStatus.SUCCESS),
          summary('background-job', JobStatus.SUCCESS),
        ],
      });

    const { result } = renderHook(() => useJobs('selected-job'));
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));

    expect(mocks.apiJson).toHaveBeenCalledTimes(2);
    expect(result.current.jobs.find(job => job.job_id === 'background-job')?.status)
      .toBe(JobStatus.SUCCESS);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);
  });

  it('never overlaps list polling requests', async () => {
    const pendingPoll = deferred<{ jobs: JobSummary[] }>();
    mocks.apiJson
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.PROCESSING)] })
      .mockReturnValueOnce(pendingPoll.promise)
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.SUCCESS)] });

    renderHook(() => useJobs(null));
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));

    expect(mocks.apiJson).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingPoll.resolve({ jobs: [summary('background-job', JobStatus.PROCESSING)] });
      await pendingPoll.promise;
    });
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(mocks.apiJson).toHaveBeenCalledTimes(3);
  });

  it('backs off after consecutive list polling errors', async () => {
    mocks.apiJson
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.PROCESSING)] })
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.SUCCESS)] });

    renderHook(() => useJobs(null));
    await flushPromises();

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));
    expect(mocks.apiJson).toHaveBeenCalledTimes(3);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 2 - 1));
    expect(mocks.apiJson).toHaveBeenCalledTimes(3);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mocks.apiJson).toHaveBeenCalledTimes(4);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(mocks.apiJson).toHaveBeenCalledTimes(4);
    expect(mocks.toast.show).not.toHaveBeenCalled();
  });

  it('pauses list polling while hidden and refreshes immediately when visible', async () => {
    mocks.apiJson
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.PROCESSING)] })
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.SUCCESS)] });

    renderHook(() => useJobs(null));
    await flushPromises();

    setVisibility('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 20));
    expect(mocks.apiJson).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);

    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS * 10));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);
  });

  it('does not let a stale list response regress a patched terminal status', async () => {
    const stalePoll = deferred<{ jobs: JobSummary[] }>();
    mocks.apiJson
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.PROCESSING)] })
      .mockReturnValueOnce(stalePoll.promise);

    const { result } = renderHook(() => useJobs(null));
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));

    act(() => {
      result.current.patchJob(summary('background-job', JobStatus.SUCCESS));
    });
    await act(async () => {
      stalePoll.resolve({ jobs: [summary('background-job', JobStatus.PROCESSING)] });
      await stalePoll.promise;
    });

    expect(result.current.jobs[0].status).toBe(JobStatus.SUCCESS);
  });

  it('queues a fresh list read after an in-flight poll when creating a job', async () => {
    const stalePoll = deferred<{ jobs: JobSummary[] }>();
    const createResponse: CreateJobResponse = {
      job_id: 'new-job',
      status: JobStatus.PENDING,
      created_at: '2026-07-14T04:30:07.763450Z',
    };
    mocks.apiJson
      .mockResolvedValueOnce({ jobs: [summary('background-job', JobStatus.PROCESSING)] })
      .mockReturnValueOnce(stalePoll.promise)
      .mockResolvedValueOnce({
        jobs: [summary('new-job', JobStatus.PENDING), summary('background-job', JobStatus.PROCESSING)],
      });
    mocks.apiFetch.mockResolvedValueOnce({ json: async () => createResponse });

    const { result } = renderHook(() => useJobs(null));
    await flushPromises();
    await act(async () => vi.advanceTimersByTimeAsync(POLL_MS));

    let createPromise!: Promise<CreateJobResponse>;
    act(() => {
      createPromise = result.current.createJob(
        new File(['pdf'], 'new-job.pdf', { type: 'application/pdf' }),
      );
    });
    await flushPromises();
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);

    await act(async () => {
      stalePoll.resolve({ jobs: [summary('background-job', JobStatus.PROCESSING)] });
      await createPromise;
    });

    expect(mocks.apiJson).toHaveBeenCalledTimes(3);
    expect(result.current.jobs.some(job => job.job_id === 'new-job')).toBe(true);
  });
});
