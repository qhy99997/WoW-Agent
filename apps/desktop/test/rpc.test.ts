import { describe, expect, it } from 'vitest';

import type { RpcResult } from '@shared/contract';
import { describeError, unwrap } from '@shared/rpc';

describe('unwrap', () => {
  it('returns the value of a successful result', () => {
    expect(unwrap({ ok: true, value: 'hello' })).toBe('hello');
  });

  it('returns falsy values unchanged', () => {
    expect(unwrap({ ok: true, value: 0 })).toBe(0);
    expect(unwrap({ ok: true, value: null })).toBeNull();
    expect(unwrap({ ok: true, value: false })).toBe(false);
  });

  it('throws an Error carrying the engine message', () => {
    const result: RpcResult<never> = {
      ok: false,
      error: { code: 'session_not_found', message: 'Session "x" was not found' },
    };

    expect(() => unwrap(result)).toThrow('Session "x" was not found');
  });

  it('throws an actual Error instance so callers can catch it', () => {
    try {
      unwrap({ ok: false, error: { code: 'x', message: 'm' } });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }
  });
});

describe('describeError', () => {
  it('reads the message off an Error', () => {
    expect(describeError(new Error('boom'))).toEqual({ text: 'boom' });
  });

  it('accepts a bare string', () => {
    expect(describeError('nope')).toEqual({ text: 'nope' });
  });

  it('falls back for values that carry no message', () => {
    expect(describeError(undefined).text).not.toBe('');
    expect(describeError(null).text).not.toBe('');
    expect(describeError({ weird: 1 }).text).not.toBe('');
    expect(describeError('').text).not.toBe('');
  });
});
