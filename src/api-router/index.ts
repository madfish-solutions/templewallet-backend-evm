import { Router, Response } from 'express';

import { withCodedExceptionHandler } from '../utils/express-helpers';
import { evmQueryParamsSchema, evmQueryParamsTransactionsSchema } from '../utils/schemas';

import { fetchTransactions } from './alchemy';
import { getEvmBalances, getEvmCollectiblesMetadata, getEvmTokensMetadata } from './covalent';

export const apiRouter = Router();

const sendData = (data: any, res: Response<any, Record<string, any>>) => {
  try {
    res.status(200).json(JSON.parse(data));
  } catch {
    res.status(200).send(data);
  }
};

apiRouter
  .get(
    '/balances',
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmBalances(walletAddress, chainId), res);
    })
  )
  .get(
    '/tokens-metadata',
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmTokensMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/collectibles-metadata',
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId } = await evmQueryParamsSchema.validate(req.query);

      sendData(await getEvmCollectiblesMetadata(walletAddress, chainId), res);
    })
  )
  .get(
    '/transactions/v2',
    withCodedExceptionHandler(async (req, res) => {
      const { walletAddress, chainId, contractAddress, olderThanBlockHeight } =
        await evmQueryParamsTransactionsSchema.validate(req.query);

      sendData(
        await fetchTransactions(
          chainId,
          walletAddress,
          contractAddress,
          olderThanBlockHeight as `${number}` | undefined
        ),
        res
      );
    })
  );
