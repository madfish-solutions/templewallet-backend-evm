import { Queue, QueueEvents, UnrecoverableError, Worker } from 'bullmq';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { IS_TESTING } from '../config';
import { redisClient } from '../redis';

import { CodedError } from './errors';

interface QueuedFetchJobsConfig<
  Name extends string,
  Inputs extends Record<Name, unknown>,
  Outputs extends Record<Name, unknown>
> {
  queueName: string;
  concurrency?: number;
  costs: Record<Name, number>;
  limitDuration: number;
  limitAmount: number;
  rateLimitTimeout?: number;
  attempts?: number;
  backoffDelay?: number;
  getDeduplicationId: <N extends Name>(name: N, data: Inputs[N]) => string;
  getOutput: <N extends Name>(name: N, data: Inputs[N]) => Promise<Outputs[N]>;
}

export const createQueuedFetchJobs = <
  Name extends string,
  Inputs extends Record<Name, unknown>,
  Outputs extends Record<Name, unknown>
>({
  queueName,
  costs,
  limitAmount,
  concurrency = Math.floor(limitAmount / Math.min(...Object.values<number>(costs))),
  limitDuration,
  rateLimitTimeout = 30_000,
  attempts = 5,
  backoffDelay = 1000,
  getDeduplicationId,
  getOutput
}: QueuedFetchJobsConfig<Name, Inputs, Outputs>) => {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: limitAmount,
    duration: limitDuration / 1000,
    keyPrefix: `job-rate-limiter:${queueName}`
  });
  const queue = new Queue<Inputs[Name], Outputs[Name], Name, Inputs[Name], Outputs[Name], Name>(queueName, {
    connection: redisClient,
    defaultJobOptions: {
      attempts,
      backoff: {
        type: 'exponential',
        delay: backoffDelay
      },
      removeOnComplete: {
        age: 60 * 60, // 1 hour
        count: 1000
      },
      removeOnFail: {
        age: 60 * 60, // 1 hour
        count: 2000
      }
    }
  });
  queue.setGlobalConcurrency(concurrency);

  const queueEvents = new QueueEvents(queueName, { connection: redisClient });
  const worker = new Worker<Inputs[Name], Outputs[Name], Name>(
    queueName,
    async job => {
      const { name, data } = job;
      const waitStartTs = Date.now();
      if (IS_TESTING) {
        await job.updateProgress('consumeRateLimit');
      }
      await new Promise<void>((res, rej) => {
        const doConsumeAttempt = async () => {
          try {
            await rateLimiter.consume('points', costs[name]);
            res();
          } catch (e) {
            if (Date.now() - waitStartTs > rateLimitTimeout) {
              rej(new UnrecoverableError('Timed out'));
            } else {
              setTimeout(doConsumeAttempt, e instanceof RateLimiterRes ? e.msBeforeNext || 100 : 1000);
            }
          }
        };
        doConsumeAttempt();
      });

      if (IS_TESTING) {
        await job.updateProgress('getOutput');
      }

      try {
        return await getOutput(name, data);
      } catch (e) {
        if (e instanceof CodedError && e.code >= 400 && e.code < 500 && e.code !== 429) {
          throw new UnrecoverableError(JSON.stringify({ code: e.code, message: e.message }));
        }

        if (e instanceof CodedError) {
          throw new Error(JSON.stringify({ code: e.code, message: e.message }));
        }

        throw e;
      }
    },
    { connection: redisClient, concurrency }
  );

  const fetch = async <N extends Name>(name: N, data: Inputs[N]): Promise<Outputs[N]> => {
    const id = getDeduplicationId(name, data);
    try {
      const job = await queue.add(name, data, { deduplication: { id } });

      return (await job.waitUntilFinished(queueEvents)) as Outputs[N];
    } catch (e) {
      if (e instanceof Error) {
        try {
          const parsedMessage = JSON.parse(e.message);
          if (parsedMessage.code && parsedMessage.message) {
            throw new CodedError(parsedMessage.code, parsedMessage.message);
          }
        } catch {}
      }

      throw e;
    }
  };

  return { fetch, queue, worker, queueEvents };
};
