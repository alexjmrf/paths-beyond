// §9.4 — "anti-replay: nonce por partida + rate limiting." Limitador em memória, janela
// deslizante por chave (jogador). Corte de escopo (ver DECISIONS.md): sem Redis — a
// stack cita Redis pra M7+, mas nada neste projeto usa Redis ainda, e um limitador
// distribuído só importa quando o servidor escalar horizontalmente, o que não é o caso
// aqui. Trocar por uma implementação Redis quando isso passar a importar de verdade.
export interface RateLimiterOptions {
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface RateLimiter {
  // true = permitido (consome uma cota); false = limite excedido.
  tryConsume(key: string): boolean;
}

export function createInMemoryRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { maxRequests, windowMs } = options;
  const now = options.now ?? Date.now;
  const hitsByKey = new Map<string, number[]>();

  return {
    tryConsume(key) {
      const nowMs = now();
      const windowStart = nowMs - windowMs;
      const recentHits = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

      if (recentHits.length >= maxRequests) {
        hitsByKey.set(key, recentHits);
        return false;
      }

      recentHits.push(nowMs);
      hitsByKey.set(key, recentHits);
      return true;
    },
  };
}
