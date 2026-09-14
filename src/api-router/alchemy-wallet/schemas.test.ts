import assert from 'node:assert/strict';

import { authorizationSchema, operationSchema, prepareSchema, statusSchema } from './schemas';

const address = '0x1111111111111111111111111111111111111111';
const request = { from: address, chainId: '0x1', calls: [{ to: address, value: '0x0', data: '0x' }] };
const options = { strict: true };

describe('Alchemy proxy input validation', () => {
  it('accepts a bounded batch with exact call fields', async () => {
    assert.deepEqual(await prepareSchema.validate(request, options), request);
  });
  it('rejects caller-defined sponsorship policies and gas overrides', async () => {
    await assert.rejects(
      prepareSchema.validate({ ...request, capabilities: { paymasterService: { policyId: 'external' } } }, options)
    );
    await assert.rejects(prepareSchema.validate({ ...request, nonceOverride: { nonceKey: '0x1' } }, options));
  });
  it('rejects malformed calls and oversized batches', async () => {
    await assert.rejects(
      prepareSchema.validate({ ...request, calls: [{ to: 'https://example.com', value: '0', data: 'oops' }] }, options)
    );
    await assert.rejects(prepareSchema.validate({ ...request, calls: Array(33).fill(request.calls[0]) }, options));
    await assert.rejects(prepareSchema.validate({ ...request, calls: [] }, options));
  });
  it('rejects arbitrary fields in signed operations and authorizations', async () => {
    await assert.rejects(authorizationSchema.validate({ address, nonce: '0x0', chainId: '0x0' }, options));
    await assert.rejects(operationSchema.validate({ sender: address, factory: address }, options));
  });
  it('accepts only bounded hex call IDs', async () => {
    await assert.rejects(statusSchema.validate({ callId: 'https://example.com' }, options));
    await assert.rejects(statusSchema.validate({ callId: `0x${'ab'.repeat(300)}` }, options));
    assert.deepEqual(await statusSchema.validate({ callId: '0xabcd' }, options), { callId: '0xabcd' });
  });
});
