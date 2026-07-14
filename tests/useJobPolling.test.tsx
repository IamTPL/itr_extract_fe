import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobPolling } from '../src/hooks/useJobPolling';
import { JobStatus, POLLING_INTERVAL_MS, POLLING_MAX_ATTEMPTS } from '../src/lib/constants';
import type { JobDetail } from '../src/lib/types';

const LONG_RUNNING_POLL_MS = 500;

const mocks = vi.hoisted(() => ({
  apiJson: vi.fn(),
  getToken: vi.fn(async () => 'token'),
}));

vi.mock('../src/lib/constants', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/constants')>();
  return {
    ...actual,
    POLLING_INTERVAL_MS: 100,
    POLLING_MAX_ATTEMPTS: 3,
    POLLING_LONG_RUNNING_INTERVAL_MS: 500,
  };
});

vi.mock('../src/lib/apiClient', () => {
  class ApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return { ApiError, apiJson: mocks.apiJson };
});

vi.mock('../src/hooks/useAccessToken', () => ({
  useAccessToken: () => mocks.getToken,
}));

function detail(status: JobDetail['status']): JobDetail {
  const terminal = status === JobStatus.SUCCESS || status === JobStatus.FAILED;
  return {
    job_id: 'selected-job',
    status,
    original_filename: 'selected-job.pdf',
    created_at: '2026-07-14T04:25:07.763450Z',
    started_at: '2026-07-14T04:25:08.763450Z',
    finished_at: terminal ? '2026-07-14T04:25:17.358413Z' : null,
    error_message: null,
    has_econsent: false,
    analysis_data: terminal ? {} : null,
    email_html: terminal ? '<p>Ready</p>' : null,
  };
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

describe('useJobPolling lifecycle', () => {
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

  it('pauses after the initial request while hidden and resumes immediately when visible', async () => {
    mocks.apiJson.mockResolvedValue(detail(JobStatus.PROCESSING));
    const { result } = renderHook(() => useJobPolling('selected-job'));
    await flushPromises();
    expect(mocks.apiJson).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 20));
    expect(mocks.apiJson).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => vi.advanceTimersByTimeAsync(0));
    expect(mocks.apiJson).toHaveBeenCalledTimes(2);
    expect(result.current.job?.status).toBe(JobStatus.PROCESSING);
  });

  it('continues slowly after the timeout threshold until the job becomes terminal', async () => {
    mocks.apiJson
      .mockResolvedValueOnce(detail(JobStatus.PROCESSING))
      .mockResolvedValueOnce(detail(JobStatus.PROCESSING))
      .mockResolvedValueOnce(detail(JobStatus.PROCESSING))
      .mockResolvedValueOnce(detail(JobStatus.SUCCESS));

    const { result } = renderHook(() => useJobPolling('selected-job'));
    await flushPromises();
    for (let attempt = 1; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      await act(async () => vi.advanceTimersByTimeAsync(POLLING_INTERVAL_MS));
    }

    expect(mocks.apiJson).toHaveBeenCalledTimes(POLLING_MAX_ATTEMPTS);
    expect(result.current.timedOut).toBe(true);

    await act(async () => vi.advanceTimersByTimeAsync(LONG_RUNNING_POLL_MS - 1));
    expect(mocks.apiJson).toHaveBeenCalledTimes(POLLING_MAX_ATTEMPTS);
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(mocks.apiJson).toHaveBeenCalledTimes(POLLING_MAX_ATTEMPTS + 1);
    expect(result.current.job?.status).toBe(JobStatus.SUCCESS);
    expect(result.current.timedOut).toBe(false);
  });
});
