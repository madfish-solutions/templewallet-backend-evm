import { AsyncLocalStorage } from 'async_hooks';

interface CollectiblesBalancesContext {
  showSpam: boolean;
  withMetadata: boolean;
}

const collectiblesBalancesContext = new AsyncLocalStorage<CollectiblesBalancesContext>();

/** Runs `fn` with the collectibles request flags. Async work started inside `fn` keeps them. */
export const runWithCollectiblesBalancesContext = <T>(showSpam: boolean, fn: () => T, withMetadata = false) =>
  collectiblesBalancesContext.run({ showSpam, withMetadata }, fn);

/** Spam stays excluded when a caller is outside a collectibles request. */
export const getShowSpam = () => collectiblesBalancesContext.getStore()?.showSpam === true;

/** Balances leave contract and token metadata unset. The metadata endpoint turns this on. */
export const getWithMetadata = () => collectiblesBalancesContext.getStore()?.withMetadata === true;
