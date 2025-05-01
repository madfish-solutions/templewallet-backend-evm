import { Queue, QueueEvents, QueueEventsListener, QueueEventsProducer, Worker } from 'bullmq';

import { redisClient } from '../redis';

export const createQueuedFetchJobs = <Name extends string, Input, SuccessOutput extends string | number>(
  queueName: string,
  getId: (name: Name, data: Input) => string,
  getOutput: (name: Name, data: Input) => Promise<SuccessOutput>,
  concurrency = 1,
  timeout = 30_000
) => {
  type WrappedOutput = { output: SuccessOutput };
  const queue = new Queue<Input, void, Name>(queueName, {
    connection: redisClient,
    defaultJobOptions: {
      attempts: 5,
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
  const worker = new Worker<Input, void, Name>(
    queueName,
    async job => {
      const { name, data } = job;
      const output = await getOutput(name, data);
      await queueEventsProducer.publishEvent<{ eventName: string } & WrappedOutput>({
        eventName: getId(name, data),
        output
      });
    },
    { connection: redisClient }
  );

  const fetch = async (name: Name, data: Input) => {
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

  return { fetch, queue, worker };
};
