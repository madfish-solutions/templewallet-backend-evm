// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./configure');

import bodyParser from 'body-parser';
import cors from 'cors';
import express from 'express';
import { stdSerializers } from 'pino';
import pinoHttp from 'pino-http';

import { apiRouter } from './api-router';
import logger from './utils/logger';

const PINO_LOGGER = {
  logger: logger.child({ name: 'web' }),
  serializers: {
    req: req => ({
      method: req.method,
      url: req.url,
      body: req.body,
      remoteAddress: req.remoteAddress,
      remotePort: req.remotePort,
      id: req.id,
      experimentalIp: req.headers['do-connecting-ip']
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

app.use('/api', apiRouter);

// start the server listening for requests
const port = Boolean(process.env.PORT) ? process.env.PORT : 3000;
app.listen(port, () => console.info(`Server is running on port ${port}...`));
