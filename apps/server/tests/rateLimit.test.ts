import { describe, expect, it } from 'vitest';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';

describe('createInMemoryRateLimiter', () => {
  it('permite até maxRequests dentro da janela', () => {
    let now = 0;
    const limiter = createInMemoryRateLimiter({ maxRequests: 3, windowMs: 1000, now: () => now });

    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(false); // 4ª dentro da mesma janela
  });

  it('libera de novo depois que a janela desliza', () => {
    let now = 0;
    const limiter = createInMemoryRateLimiter({ maxRequests: 2, windowMs: 1000, now: () => now });

    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(false);

    now = 1001; // janela inteira passou
    expect(limiter.tryConsume('player-1')).toBe(true);
  });

  it('cada chave (jogador) tem sua própria janela, independente', () => {
    let now = 0;
    const limiter = createInMemoryRateLimiter({ maxRequests: 1, windowMs: 1000, now: () => now });

    expect(limiter.tryConsume('player-1')).toBe(true);
    expect(limiter.tryConsume('player-1')).toBe(false);
    expect(limiter.tryConsume('player-2')).toBe(true); // outra chave, não afetada
  });
});
