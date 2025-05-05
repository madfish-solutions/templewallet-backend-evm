import { Queue, QueueEvents, QueueEventsListener, QueueEventsProducer, UnrecoverableError, Worker } from 'bullmq';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { redisClient } from '../redis';

interface QueuedFetchJobsConfig<
  Name extends string,
  Inputs extends Record<Name, unknown>,
  SuccessOutput extends string | number
> {
  queueName: string;
  concurrency?: number;
  costs: Record<Name, number>;
  limitDuration: number;
  limitAmount: number;
  timeout?: number;
  getId: <N extends Name>(name: N, data: Inputs[N]) => string;
  getOutput: <N extends Name>(name: N, data: Inputs[N]) => Promise<SuccessOutput>;
}

export const createQueuedFetchJobs = <
  Name extends string,
  Inputs extends Record<Name, unknown>,
  SuccessOutput extends string | number
>({
  queueName,
  costs,
  limitAmount,
  concurrency = Math.floor(limitAmount / Math.min(...Object.values<number>(costs))),
  limitDuration,
  timeout = 30_000,
  getId,
  getOutput
}: QueuedFetchJobsConfig<Name, Inputs, SuccessOutput>) => {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: limitAmount,
    duration: limitDuration / 1000,
    keyPrefix: `rate-limiter:${queueName}`
  });
  type WrappedOutput = { output: SuccessOutput };
  const queue = new Queue<Inputs[Name], void, Name>(queueName, {
    connection: redisClient,
    defaultJobOptions: {
      attempts: Math.floor(Math.log2(timeout / 1000)) + 1,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: {
        age: 60 * 60, // 1 hour
        count: 1000
      },
      removeOnFail: {
        age: 60 * 60, // 1 hour
        count: 5000
      }
    }
  });
  queue.setGlobalConcurrency(concurrency);

  const queueEventsProducer = new QueueEventsProducer(queueName, { connection: redisClient });
  const queueEvents = new QueueEvents(queueName, { connection: redisClient });
  type CustomListener = QueueEventsListener & Record<string, (args: WrappedOutput, id: string) => void>;
  const worker = new Worker<Inputs[Name], void, Name>(
    queueName,
    async job => {
      const { name, data } = job;
      const waitStartTs = Date.now();
      await job.updateProgress('consumeRateLimit');
      await new Promise<void>((res, rej) => {
        const doConsumeAttempt = async () => {
          try {
            await rateLimiter.consume('points', costs[name]);
            res();
          } catch (e) {
            if (Date.now() - waitStartTs > timeout) {
              rej(new UnrecoverableError('Timed out'));
            }

            if (e instanceof RateLimiterRes) {
              setTimeout(doConsumeAttempt, e.msBeforeNext || 100);
            }
          }
        };
        doConsumeAttempt();
      });

      await job.updateProgress('getOutput');
      const output = await getOutput(name, data);
      await queueEventsProducer.publishEvent<{ eventName: string } & WrappedOutput>({
        eventName: getId(name, data),
        output
      });
    },
    { connection: redisClient, concurrency }
  );

  const fetch = async <N extends Name>(name: N, data: Inputs[N]) => {
    const id = getId(name, data);
    let listener: ((args: WrappedOutput) => void) | undefined;

    return Promise.race([
      new Promise<SuccessOutput>((resolve, reject) => {
        listener = ({ output }: WrappedOutput) => resolve(output);
        queueEvents.on<CustomListener>(id, listener);
        queueEvents.on('failed', ({ jobId, failedReason }) => void (jobId === id && reject(new Error(failedReason))));
        // @ts-expect-error
        queue.add(name, data, { deduplication: { id } });
      }),
      new Promise<SuccessOutput>((_, reject) => setTimeout(() => reject(new Error('Timed out')), timeout))
    ]).finally(() => {
      if (listener) {
        queueEvents.off<CustomListener>(id, listener);
      }
    });
  };

  return { fetch, queue, worker, queueEvents };
};
