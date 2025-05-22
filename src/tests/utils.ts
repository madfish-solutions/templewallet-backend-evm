import assert, { deepStrictEqual } from 'assert';
import axios, { AxiosError } from 'axios';
import type { JobProgress, JobState, Queue, QueueEvents } from 'bullmq';

import { PORT } from '../config';

export const api = axios.create({ baseURL: `http://localhost:${PORT}/api` });
export const VITALIK_ADDRESS = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';
export const TEST_ACCOUNT_ADDRESS = '0x4D85A924B1b137abf7acb9B0c07355a97460637E';
export const TEST_ACCOUNT_ADDRESS_UPPER = '0x4D85A924B1B137ABF7ACB9B0C07355A97460637E';

const objectWithoutUndefined = <T extends object>(obj: T) => {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          return [key, objectWithoutUndefined(value)];
        }

        return [key, value];
      })
  ) as T;
};
const toWithoutUndefinedPropsValue = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map(toWithoutUndefinedPropsValue) as T;
  }

  if (typeof value === 'object' && value !== null) {
    return objectWithoutUndefined(value);
  }

  return value;
};

export const deepEqualWithoutUndefinedProps = <T extends object>(actual: T, expected: T, message?: string) =>
  deepStrictEqual(toWithoutUndefinedPropsValue(actual), toWithoutUndefinedPropsValue(expected), message);

const getJobsSnapshot = async <Name extends string, Data>(queue: Queue<Data, void, Name>) => {
  const allJobs = await queue.getJobs();

  return Promise.all(
    allJobs.map(async job => {
      const { name, data } = job;

      return { name, data, state: await job.getState() };
    })
  );
};

export interface JobSnapshot<Name extends string, Data> {
  name: Name;
  data: Data;
  state: JobState | 'unknown';
}

export const makeCheckJobsFunction =
  <Name extends string, Data, T extends unknown[]>(
    queue: Queue<Data, void, Name>,
    checkFn: (allJobs: JobSnapshot<Name, Data>[], ...args: T) => void
  ) =>
  async (...args: T) =>
    checkFn(await getJobsSnapshot(queue), ...args);

export const withQueueEventsListening = async <T, N extends string>(
  queueEvents: QueueEvents,
  makeRequests: () => Promise<PromiseSettledResult<T>[]>,
  queue: Queue<unknown, void, N>,
  requestsCosts: Record<N, number>
) => {
  const ptsConsumption: Record<number, number> = {};
  const progressListener = async ({ jobId, data }: { jobId: string; data: JobProgress }) => {
    if (data === 'getOutput') {
      const job = await queue.getJob(jobId);

      if (!job) {
        return;
      }

      const ts = Date.now();
      ptsConsumption[ts] = (ptsConsumption[ts] ?? 0) + requestsCosts[job.name];
    }
  };
  const jobCounterChanges: Record<number, number> = {};
  const activeListener = () => {
    const ts = Date.now();
    jobCounterChanges[ts] = (jobCounterChanges[ts] ?? 0) + 1;
  };
  const jobSlotFreedListener = () => {
    const ts = Date.now();
    jobCounterChanges[ts] = (jobCounterChanges[ts] ?? 0) - 1;
  };
  const callbacks = {
    progress: progressListener,
    active: activeListener,
    completed: jobSlotFreedListener,
    failed: jobSlotFreedListener,
    delayed: jobSlotFreedListener
  } as const;
  for (const key in callbacks) {
    // @ts-expect-error
    queueEvents.on(key, callbacks[key]);
  }
  try {
    const results = await makeRequests();

    if (results.every(result => result.status === 'fulfilled')) {
      return { result: results.map(result => result.value), ptsConsumption, jobCounterChanges };
    }

    throw results.find(result => result.status === 'rejected')!.reason;
  } finally {
    for (const key in callbacks) {
      // @ts-expect-error
      queueEvents.off(key, callbacks[key]);
    }
  }
};

export const assertPointsConsumption = (
  ptsConsumption: Record<number, number>,
  limitPerPeriod: number,
  period = 1000
) => {
  let lastRequestTs = 0;
  let capacityAfterLastRequest = limitPerPeriod;
  for (const rawTs in ptsConsumption) {
    const ts = Number(rawTs);
    const currentCapacity = Math.min(
      capacityAfterLastRequest + Math.floor((limitPerPeriod * (ts - lastRequestTs)) / period),
      limitPerPeriod
    );
    const pointsConsumed = ptsConsumption[ts];
    assert(
      pointsConsumed <= currentCapacity,
      `Tried to consume ${pointsConsumed} pts at ${new Date(ts).toISOString()} but only ${currentCapacity} available`
    );
    capacityAfterLastRequest = currentCapacity - pointsConsumed;
    lastRequestTs = ts;
  }
};

export const assertConcurrency = (jobCounterChanges: Record<number, number>, concurrency: number) => {
  let currentConcurrency = 0;
  for (const rawTs in jobCounterChanges) {
    const ts = Number(rawTs);
    const change = jobCounterChanges[ts];
    currentConcurrency += change;
    assert(
      currentConcurrency <= concurrency,
      `Tried to run ${currentConcurrency} jobs at ${new Date(ts).toISOString()} but only ${concurrency} available`
    );
  }
};

export const isBadRequestError = (error: unknown) => error instanceof AxiosError && error.response?.status === 400;
