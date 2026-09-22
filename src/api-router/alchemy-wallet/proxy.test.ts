import axios from 'axios';
import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { ValidationError } from 'yup';

import { EnvVars } from '../../config';

import { prepareSchema, sendSchema } from './schemas';
import { assertChain, getSubmissionSender, rpc } from './utils';

const address = '0x1111111111111111111111111111111111111111';
const signature = { type: 'secp256k1', data: `0x${'11'.repeat(65)}` };
const operation = {
  type: 'user-operation-v070',
  chainId: '0x1',
  signature,
  data: {
    sender: address,
    nonce: '0x1',
    callData: '0x1234',
    callGasLimit: '0x1',
    verificationGasLimit: '0x1',
    preVerificationGas: '0x1',
    maxFeePerGas: '0x2',
    maxPriorityFeePerGas: '0x1'
  }
};
const authorization = {
  type: 'authorization',
  chainId: '0x1',
  signature,
  data: { address: '0x77021100bD87b7008E5E1989d0eB38555d0d0000', nonce: '0x0' }
};
const options = { strict: true };
const originalApiKey = EnvVars.ALCHEMY_API_KEY;
afterEach(() => {
  mock.restoreAll();
  EnvVars.ALCHEMY_API_KEY = originalApiKey;
});

test('accepts a single operation or an authorization-plus-operation tuple', async () => {
  assert.deepEqual(await sendSchema.validate(operation, options), operation);
  const tuple = { type: 'array', data: [authorization, operation] };
  assert.deepEqual(await sendSchema.validate(tuple, options), tuple);
  assert.equal(getSubmissionSender(tuple), address);
});
for (const [name, body] of [
  ['standalone authorization', authorization],
  ['reversed tuple', { type: 'array', data: [operation, authorization] }],
  ['duplicate operations', { type: 'array', data: [operation, operation] }],
  ['one-item array', { type: 'array', data: [operation] }],
  ['different chains', { type: 'array', data: [{ ...authorization, chainId: '0xa' }, operation] }],
  [
    'untrusted delegation',
    { type: 'array', data: [{ ...authorization, data: { ...authorization.data, address } }, operation] }
  ],
  ['extra top-level fields', { ...operation, url: 'https://example.test' }],
  ['extra operation fields', { ...operation, data: { ...operation.data, factory: address } }]
] as const) {
  test(`rejects ${name}`, async () => {
    await assert.rejects(sendSchema.validate(body, options));
  });
}
for (const multiplier of [0, -1, 0.69, 1.01, Infinity]) {
  test(`rejects fee multiplier ${multiplier}`, async () => {
    await assert.rejects(
      prepareSchema.validate(
        {
          from: address,
          chainId: '0x1',
          calls: [{ to: address, data: '0x', value: '0x0' }],
          capabilities: {
            eip7702Auth: { delegation: 'ModularAccountV2', version: 'v1.1.0' },
            gasParamsOverride: { maxFeePerGas: { multiplier }, maxPriorityFeePerGas: { multiplier } }
          }
        },
        options
      )
    );
  });
}
test('rejects disabled chains before the proxy request', () => {
  assert.throws(() => assertChain('0x89'), /disabled/);
});
test('forwards JSON-RPC parameters and preserves successful results', async () => {
  const post = mock.method(axios, 'post', async () => ({ data: { jsonrpc: '2.0', id: 1, result: { id: '0x1234' } } }));
  assert.deepEqual(await rpc('wallet_sendPreparedCalls', operation), {
    jsonrpc: '2.0',
    id: 1,
    result: { id: '0x1234' }
  });
  assert.deepEqual(post.mock.calls[0].arguments[1], {
    jsonrpc: '2.0',
    id: 1,
    method: 'wallet_sendPreparedCalls',
    params: [operation]
  });
});
test('returns a retryable rate-limit error without Axios credentials', async () => {
  mock.method(axios, 'post', async () => {
    throw {
      isAxiosError: true,
      response: { status: 429 },
      config: { url: 'https://api.g.alchemy.com/v2/private-secret' }
    };
  });
  const result = await rpc('wallet_prepareCalls', {});
  assert.match(JSON.stringify(result), /429/);
  assert.doesNotMatch(JSON.stringify(result), /private-secret|config|https/);
});
test('returns a safe temporary error after a timeout', async () => {
  mock.method(axios, 'post', async () => {
    throw new Error('Timeout at https://api.g.alchemy.com/v2/private-secret');
  });
  assert.deepEqual(await rpc('wallet_prepareCalls', {}), {
    jsonrpc: '2.0',
    id: 1,
    error: { code: -32000, message: 'Alchemy is unavailable. Retry the operation.' }
  });
});
test('redacts credentials from upstream error messages and nested data', async () => {
  EnvVars.ALCHEMY_API_KEY = 'test-secret';
  mock.method(axios, 'post', async () => ({
    data: {
      error: {
        code: -32000,
        message: 'Request test-secret failed',
        data: { reason: 'https://api.g.alchemy.com/v2/test-secret' }
      }
    }
  }));
  const result = await rpc('wallet_prepareCalls', {});
  assert.doesNotMatch(JSON.stringify(result), /test-secret|https/);
  assert.match(JSON.stringify(result), /-32000/);
});

for (const body of [
  undefined,
  {},
  { type: 'array' },
  { type: 'array', data: [] },
  { type: 'array', data: [{ ...authorization, chainId: 'bad' }, operation] }
]) {
  test(`returns a validation error for malformed submission ${JSON.stringify(body)}`, async () => {
    await assert.rejects(sendSchema.validate(body, options), ValidationError);
  });
}
for (const multiplier of [0.7, 0.85, 1]) {
  test(`accepts the supported fee multiplier ${multiplier}`, async () => {
    const body = {
      from: address,
      chainId: '0x1',
      calls: [{ to: address, data: '0x', value: '0x0' }],
      capabilities: {
        eip7702Auth: { delegation: 'ModularAccountV2', version: 'v1.1.0' },
        gasParamsOverride: { maxFeePerGas: { multiplier }, maxPriorityFeePerGas: { multiplier } }
      }
    };
    assert.deepEqual(await prepareSchema.validate(body, options), body);
  });
}
test('returns a validation error for missing gas overrides', async () => {
  await assert.rejects(
    prepareSchema.validate({ from: address, chainId: '0x1', calls: [], capabilities: {} }, options),
    ValidationError
  );
});
