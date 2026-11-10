import { NftTokenType } from '@temple-wallet/alchemy-sdk';

import type { CollectibleAttribute, Page } from './types.js';

const INTEGER_PATTERN = /^\d+$/;

export const parseInteger = (value: string | number | null | undefined): bigint | null => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      return null;
    }

    return BigInt(value);
  }

  if (value == null || !INTEGER_PATTERN.test(value)) {
    return null;
  }

  return BigInt(value);
};

export const parseDate = (value: string | undefined): Date | null => {
  if (value == null || value === '') {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const supportsErcFromStandard = (standard: string | null | undefined): string[] => {
  const normalized = standard?.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'erc721') {
    return ['erc721'];
  }
  if (normalized === 'erc1155') {
    return ['erc1155'];
  }
  if (normalized === 'erc20') {
    return ['erc20'];
  }

  return [];
};

export const supportsErcFromTokenType = (tokenType: NftTokenType): string[] => {
  if (tokenType === NftTokenType.ERC721) {
    return ['erc721'];
  }
  if (tokenType === NftTokenType.ERC1155) {
    return ['erc1155'];
  }

  return [];
};

const GOLDRUSH_IMAGE_PROXY = 'https://image-proxy.svc.prod.covalenthq.com/cdn-cgi/image/width=';
const SEADN_HOSTS = new Set(['i.seadn.io', 'i2.seadn.io', 'i2c.seadn.io', 'raw.seadn.io', 'raw2.seadn.io']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv']);

export interface SizedImageUrls {
  image256: string | null;
  image512: string | null;
  image1024: string | null;
}

const EMPTY_SIZED_IMAGES: SizedImageUrls = { image256: null, image512: null, image1024: null };

const httpUrl = (value: string): URL | null => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return url;
  } catch {
    return null;
  }
};

const pathExtension = (url: URL) => {
  const dot = url.pathname.lastIndexOf('.');
  if (dot < 0 || dot === url.pathname.length - 1) {
    return null;
  }

  return url.pathname.slice(dot + 1).toLowerCase();
};

/** Still frame on OpenSea's CDN. The 512 slot stays at `w=500`, which is the preview OpenSea serves. */
const openSeaPreview = (value: string, width: number): string | null => {
  const url = httpUrl(value);
  if (url == null || !SEADN_HOSTS.has(url.hostname)) {
    return null;
  }

  url.hostname = 'i2.seadn.io';
  const extension = pathExtension(url);
  if (extension != null && VIDEO_EXTENSIONS.has(extension)) {
    url.search = `frame-time=1&w=${width}`;
  } else {
    url.searchParams.set('w', String(width));
  }

  return url.toString();
};

/** GoldRush resizes an arbitrary image: `width=<size>,fit/<original>`. */
const goldrushSizedImage = (value: string, width: 256 | 512 | 1024): string | null => {
  const url = httpUrl(value);
  if (url == null || url.hostname === 'image-proxy.svc.prod.covalenthq.com' || SEADN_HOSTS.has(url.hostname)) {
    return null;
  }

  return `${GOLDRUSH_IMAGE_PROXY}${width},fit/${value}`;
};

const sizedImageUrls = (value: string): SizedImageUrls => {
  if (openSeaPreview(value, 500) != null) {
    return {
      image256: openSeaPreview(value, 256),
      image512: openSeaPreview(value, 500),
      image1024: openSeaPreview(value, 1024)
    };
  }

  return {
    image256: goldrushSizedImage(value, 256),
    image512: goldrushSizedImage(value, 512),
    image1024: goldrushSizedImage(value, 1024)
  };
};

/** OpenSea CDN previews win. Any other http(s) image is sent through the GoldRush proxy. */
export const sizedImageUrlsFrom = (...values: Array<string | null | undefined>): SizedImageUrls => {
  const urls = values.filter((value): value is string => value != null && value !== '');
  const preview = urls.find(url => openSeaPreview(url, 500) != null);
  if (preview != null) {
    return sizedImageUrls(preview);
  }

  const original = urls.find(url => goldrushSizedImage(url, 256) != null);
  if (original != null) {
    return sizedImageUrls(original);
  }

  return EMPTY_SIZED_IMAGES;
};

export const firstNonEmpty = (...values: Array<string | null | undefined>): string | null => {
  for (const value of values) {
    if (value != null && value !== '') {
      return value;
    }
  }

  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

/** Alchemy raw metadata uses `trait_type`. OpenSea's client camelizes it to `traitType`. */
export const normalizeAttributes = (value: unknown): CollectibleAttribute[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const attributes: CollectibleAttribute[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }

    const traitType = entry.trait_type ?? entry.traitType;
    if (typeof traitType !== 'string' || traitType === '') {
      continue;
    }

    const rawValue = entry.value;
    if (typeof rawValue === 'string') {
      attributes.push({ trait_type: traitType, value: rawValue });
    } else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      attributes.push({ trait_type: traitType, value: String(rawValue) });
    }
  }

  return attributes;
};

export const collectPages = async <T>(
  fetchPage: (cursor: string | undefined) => Promise<Page<T>>,
  options?: { continueOnEmpty?: boolean }
): Promise<T[]> => {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    if (page.next == null || page.next === '' || seenCursors.has(page.next)) {
      return items;
    }
    // Alchemy NFT pages can be empty and still carry a pageKey. The following page may have NFTs.
    if (page.items.length === 0 && options?.continueOnEmpty !== true) {
      return items;
    }

    seenCursors.add(page.next);
    cursor = page.next;
  }
};
