import { Redis } from 'ioredis';

import { EnvVars } from './config.js';
import logger from './utils/logger.js';

// `maxRetriesPerRequest: null` is required by BullMQ
export const redisClient = new Redis(EnvVars.REDIS_URL, { maxRetriesPerRequest: null });
redisClient.on('error', err => logger.error(err));
