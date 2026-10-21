import { describe, expect, it } from 'vitest';

import { guard, toRpcError } from '../src/main/guard';

describe('guard', () => {
  it('wraps a plain value', async () => {
    expect(await guard(() => 42)).toEqual({ ok: true, value: 42 });
  });

  it('wraps a resolved promise', async () => {
    expect(await guard(async () => 'done')).toEqual({ ok: true, value: 'done' });
  });

  it('turns a synchronous throw into an error result instead of rejecting', async () => {
    const result = await guard(() => {
      throw new Error('boom');
    });

    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'boom' } });
  });

  it('turns a rejected promise into an error result', async () => {
    const result = await guard(async () => {
      throw new Error('async boom');
    });

    expect(result).toEqual({ ok: false, error: { code: 'internal', message: 'async boom' } });
  });

  it('never rejects, so a handler can always answer the renderer', async () => {
    await expect(
      guard(() => {
        throw new Error('still fine');
      }),
    ).resolves.toMatchObject({ ok: false });
  });
});

describe('toRpcError', () => {
  it('keeps a meaningful error name as the code', () => {
    const error = new Error('not found');
    error.name = 'session_not_found';

    expect(toRpcError(error)).toEqual({ code: 'session_not_found', message: 'not found' });
  });

  it('falls back to internal for a plain Error', () => {
    expect(toRpcError(new Error('plain'))).toEqual({ code: 'internal', message: 'plain' });
  });

  it('carries a hint through when the error has one', () => {
    const error = Object.assign(new Error('missing key'), { hint: 'add one in settings' });

    expect(toRpcError(error)).toEqual({
      code: 'internal',
      message: 'missing key',
      hint: 'add one in settings',
    });
  });

  it('accepts a bare string', () => {
    expect(toRpcError('nope')).toEqual({ code: 'internal', message: 'nope' });
  });

  it('prefers the engine code over the KimiError class name', () => {
    const error = Object.assign(new Error('Session "x" was not found'), {
      name: 'KimiError',
      code: 'session_not_found',
    });

    expect(toRpcError(error)).toEqual({
      code: 'session_not_found',
      message: 'Session "x" was not found',
    });
  });

  it('falls back to internal when a KimiError carries no code', () => {
    const error = Object.assign(new Error('weird'), { name: 'KimiError' });

    expect(toRpcError(error)).toEqual({ code: 'internal', message: 'weird' });
  });

  it('does not leak non-serialisable values', () => {
    expect(toRpcError(undefined)).toEqual({ code: 'internal', message: 'Unexpected error' });
    expect(toRpcError({ weird: true })).toEqual({
      code: 'internal',
      message: 'Unexpected error',
    });
    expect(toRpcError(null)).toEqual({ code: 'internal', message: 'Unexpected error' });
  });
});
