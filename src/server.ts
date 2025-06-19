// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./configure');

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import { Server } from 'http';
import { stdSerializers } from 'pino';
import pinoHttp from 'pino-http';

import { apiRouter } from './api-router';
import { setupBullBoard } from './bull-board';
import { EnvVars, PORT } from './config';
import logger from './utils/logger';

export const setupServer = () => {
  const PINO_LOGGER = {
    logger: logger.child({ name: 'web' }),
    serializers: {
      req: req => ({
        method: req.method,
        url: req.url,
        body: req.body,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
        id: req.id
      }),
      err: err => {
        const { type, message } = stdSerializers.err(err);

        return { type, message };
      },
      res: res => ({
        statusCode: res.statusCode
      })
    }
  };

  const app = express();
  app.use(pinoHttp(PINO_LOGGER));
  app.use(cors());
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(session({ secret: EnvVars.ADMIN_PASSWORD, saveUninitialized: true, resave: true }));

  setupBullBoard(app);
  app.use('/api', apiRouter);

  return new Promise<Server>((resolve, reject) => {
    const server = app.listen(PORT, e => {
      if (e) {
        logger.error(e, 'Error starting server');
        reject(e);
      } else {
        logger.info(`Server is running on port ${PORT}...`);
        resolve(server);
      }
    });
  });
};
