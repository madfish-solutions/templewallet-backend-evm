import { Alchemy } from '@temple-wallet/alchemy-sdk';
import memoizee from 'memoizee';
import { isHex } from 'viem';

import { EnvVars } from '../../config.js';
import { getCacheKey } from '../../utils/cache.js';
import { ALCHEMY_CHAINS_NAMES } from '../../utils/chains.js';
import { CodedError } from '../../utils/errors.js';

import { ALCHEMY_CLIENTS_CACHE_SIZE } from './constants.js';

export const getAlchemyClient = memoizee(
  (chainId: number) => {
    const network = ALCHEMY_CHAINS_NAMES[chainId];

    if (!network) throw new CodedError(422, 'Chain not supported');

    return new Alchemy({
      apiKey: EnvVars.ALCHEMY_API_KEY,
      network,
      maxRetries: 0
    });
  },
  { max: ALCHEMY_CLIENTS_CACHE_SIZE }
);

type SimplePartValue = string | number | boolean | undefined;
type PartValue = SimplePartValue | Array<PartValue>;
const separators = ':,|';
export const formatDeduplicationId = (separatorIndex: number, ...parts: PartValue[]): string =>
  parts.reduce<string>((acc, part, i) => {
    let valueToStringify: SimplePartValue;
    if (Array.isArray(part)) {
      valueToStringify = formatDeduplicationId(Math.min(separatorIndex + 1, separators.length - 1), ...part);
    } else if (isHex(part)) {
      valueToStringify = part.toLowerCase();
    } else {
      valueToStringify = part;
    }

    return acc + (i > 0 ? separators[separatorIndex] : '') + valueToStringify;
  }, '');

export const getAlchemyCacheKey = (queryName: string, ...parts: PartValue[]) =>
  getCacheKey('alchemy', [queryName].concat(parts.map(part => formatDeduplicationId(1, part))));
