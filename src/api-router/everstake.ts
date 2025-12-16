import axios, { AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import { IncomingHttpHeaders } from 'http';
import { omit } from 'lodash';

import logger from '../utils/logger';

class NotAllowedMethodError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotAllowedMethodError';
  }
}

const allowedBodyMethods = ['post', 'patch'];
const isAllowedBodyMethod = (method: string): method is 'post' | 'patch' => allowedBodyMethods.includes(method);
const allowedNoBodyMethods = ['get', 'delete'];
const isAllowedNoBodyMethod = (method: string): method is 'get' | 'delete' => allowedNoBodyMethods.includes(method);

const toAxiosRequestHeaders = (headers: IncomingHttpHeaders) => {
  const axiosHeaders: RawAxiosRequestHeaders = {};
  for (const key in headers) {
    if (key === 'host') {
      continue;
    }

    const value = headers[key];

    if (value === undefined) {
      continue;
    }

    axiosHeaders[key] = typeof value === 'string' ? value : value.join(', ');
  }

  return axiosHeaders;
};

const createRequestsProxy = (baseURL: string) => {
  const api = axios.create({ baseURL });

  return async (req, res) => {
    const methodName = req.method.toLowerCase();

    try {
      const commonRequestConfig = {
        params: req.query,
        headers: omit(
          toAxiosRequestHeaders(req.headers),
          'connection',
          'Connection',
          'content-length',
          'Content-Length'
        )
      };

      let response: AxiosResponse;
      if (isAllowedNoBodyMethod(methodName)) {
        response = await api[methodName](req.path, commonRequestConfig);
      } else if (isAllowedBodyMethod(methodName)) {
        response = await api[methodName](req.path, req.body, commonRequestConfig);
      } else {
        throw new NotAllowedMethodError('Method Not Allowed');
      }

      res.status(response.status).send(response.data);
    } catch (error) {
      logger.error(error);

      if (error instanceof NotAllowedMethodError) {
        res.status(405).json({ error: 'Method Not Allowed' });

        return;
      }

      if (axios.isAxiosError(error) && error.response) {
        // TODO: add setting headers to response if needed
        res.status(error.response.status).send(error.response.data);
      } else {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  };
};
export const everstakeWalletRequestsProxy = createRequestsProxy('https://wallet-sdk-api.everstake.one');
export const everstakeDashboardRequestsProxy = createRequestsProxy('https://dashboard-api.everstake.one');
export const everstakeEthRequestsProxy = createRequestsProxy('https://eth-api-b2c.everstake.one/api/v1');
