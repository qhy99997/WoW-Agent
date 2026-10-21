import { describe, expect, it } from 'vitest';

import { describeTurnEnd } from '../src/main/agentHost';

describe('describeTurnEnd', () => {
  it('stays quiet when the turn completed', () => {
    expect(describeTurnEnd({ reason: 'completed' })).toBeNull();
  });

  it('stays quiet when the user cancelled', () => {
    expect(describeTurnEnd({ reason: 'cancelled' })).toBeNull();
  });

  it('reports a failure with the engine detail', () => {
    expect(describeTurnEnd({ reason: 'failed', error: { message: 'fetch failed' } })).toBe(
      '这一轮失败了：fetch failed',
    );
  });

  it('still reports a failure with no detail', () => {
    const text = describeTurnEnd({ reason: 'failed' });

    expect(text).not.toBeNull();
    expect(text).toContain('失败');
  });

  it('reports a blocked turn separately from a failure', () => {
    const text = describeTurnEnd({ reason: 'blocked' });

    expect(text).not.toBeNull();
    expect(text).toContain('拦下');
  });

  it('ignores whitespace-only error text', () => {
    expect(describeTurnEnd({ reason: 'failed', error: { message: '   ' } })).toBe(
      '这一轮失败了，没有拿到模型回复。',
    );
  });

  it('ignores a non-string error message', () => {
    const event = { reason: 'failed' as const, error: { message: undefined } };

    expect(describeTurnEnd(event)).toBe('这一轮失败了，没有拿到模型回复。');
  });
});
