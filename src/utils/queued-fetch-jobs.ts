import { Job, Queue, QueueEvents, QueueEventsListener, QueueEventsProducer, UnrecoverableError, Worker } from 'bullmq';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';

import { IS_TESTING } from '../config';
import { redisClient } from '../redis';

import { CodedError } from './errors';

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
  getDeduplicationId: <N extends Name>(name: N, data: Inputs[N]) => string;
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
  getDeduplicationId,
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
      if (IS_TESTING) {
        await job.updateProgress('consumeRateLimit');
      }
      await new Promise<void>((res, rej) => {
        const doConsumeAttempt = async () => {
          try {
            await rateLimiter.consume('points', costs[name]);
            res();
          } catch (e) {
            if (Date.now() - waitStartTs > timeout) {
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
        const output = await getOutput(name, data);
        await queueEventsProducer.publishEvent<{ eventName: string } & WrappedOutput>({
          eventName: getDeduplicationId(name, data),
          output
        });
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

  const fetch = async <N extends Name>(name: N, data: Inputs[N]) => {
    const id = getDeduplicationId(name, data);
    let listener: (args: WrappedOutput) => void;
    let job: Job | undefined;
    let failedListener: QueueEventsListener['failed'];

    return new Promise<SuccessOutput>(async (resolve, reject) => {
      listener = ({ output }: WrappedOutput) => resolve(output);
      failedListener = async ({ jobId, failedReason }) => void (jobId === job?.id && reject(new Error(failedReason)));
      queueEvents.on<CustomListener>(id, listener);
      queueEvents.on('failed', failedListener);
      // @ts-expect-error
      job = await queue.add(name, data, { deduplication: { id } });
    })
      .catch(e => {
        if (e instanceof Error) {
          try {
            const parsedMessage = JSON.parse(e.message);
            if (parsedMessage.code && parsedMessage.message) {
              throw new CodedError(parsedMessage.code, parsedMessage.message);
            }
          } catch {}
        }

        throw e;
      })
      .finally(() => {
        queueEvents.off<CustomListener>(id, listener);
        queueEvents.off('failed', failedListener);
      });
  };

  return { fetch, queue, worker, queueEvents };
};
