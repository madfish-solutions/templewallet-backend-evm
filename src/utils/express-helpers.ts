import { RequestHandler, Response } from 'express';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { ValidationError } from 'yup';

import { CodedError } from './errors.js';
import logger from './logger.js';

export const withCodedExceptionHandler =
  (handler: RequestHandler): RequestHandler =>
  async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error: any) {
      logger.error(error);

      if (error instanceof CodedError) {
        res.status(error.code).send(error.buildResponse());
      } else if (error instanceof ValidationError) {
        res.status(400).send({ error: error.message });
      } else if (error instanceof RateLimiterRes) {
        res
          .status(503)
          .setHeader('Retry-After', Math.ceil(error.msBeforeNext / 1000).toString())
          .send({ message: 'Rate limit exceeded' });
      } else {
        res.status(500).send({ message: error?.message });
      }
    }
  };

export const sendData = (data: any, res: Response<any, Record<string, any>>) => {
  try {
    res.status(200).json(JSON.parse(data));
  } catch {
    res.status(200).send(data);
  }
};
