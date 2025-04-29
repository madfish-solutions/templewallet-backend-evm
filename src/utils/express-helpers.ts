import { RequestHandler } from 'express';
import { ValidationError } from 'yup';

import { CodedError } from './errors';
import logger from './logger';

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
      } else {
        res.status(500).send({ message: error?.message });
      }
    }
  };
