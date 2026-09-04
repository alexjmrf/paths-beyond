import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import { runMigrations } from '../src/migrate.js';
import { createPostgresRateLimiter } from '../src/repository/postgresRepository.js';

// §9.4/§2 (M22, sub-sessão 3/N) — o limitador COMPARTILHADO entre processos.
//
// **O defeito que ele corrige.** O limitador em memória conta por instância: com dois
// processos atrás de um balanceador, o teto real vira o dobro do declarado; com dez, dez
// vezes. Como o limite existe para proteger as rotas que gastam a moeda comprável com
// dinheiro real (as que a 3/N acabou de cobrir), um teto que se multiplica com a escala é um
// teto que não existe.
//
// **Postgres e não Redis, com o argumento:** o §2 previu Redis e ele nunca entrou no
// projeto. Postgres é dependência real desde o M19, sobe no CI, e permite PROVAR o limite
// valendo entre duas conexões independentes. Uma implementação Redis que ninguém consegue
// exercitar aqui seria código que se supõe funcionar.
//
// Pulado sem `DATABASE_URL`, no mesmo padrão de `repositoryParity` e `producaoPostgres`.

const DATABASE_URL = process.env.DATABASE_URL;
const descreve = DATABASE_URL ? describe : describe.skip;

describe('o limitador em memória', () => {
  it('deixa passar até o teto e recusa depois', async () => {
    let agora = 1_000;
    const limitador = createInMemoryRateLimiter({ maxRequests: 2, windowMs: 1_000, now: () => agora });

    expect(await limitador.tryConsume('jogador')).toBe(true);
    expect(await limitador.tryConsume('jogador')).toBe(true);
    expect(await limitador.tryConsume('jogador')).toBe(false);

    // A janela deslizante libera de novo.
    agora += 1_001;
    expect(await limitador.tryConsume('jogador')).toBe(true);
  });

  it('conta por CHAVE — um jogador não gasta a cota do outro', async () => {
    const limitador = createInMemoryRateLimiter({ maxRequests: 1, windowMs: 60_000 });

    expect(await limitador.tryConsume('jogador-a')).toBe(true);
    expect(await limitador.tryConsume('jogador-a')).toBe(false);
    expect(await limitador.tryConsume('jogador-b')).toBe(true);
  });
});

descreve('o limitador compartilhado (Postgres)', () => {
  let pool: Pool;
  const chave = `jogador-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM rate_limit_hits WHERE key LIKE $1', ['jogador-%']);
    await pool.end();
  });

  it('deixa passar até o teto e recusa depois', async () => {
    const limitador = createPostgresRateLimiter(pool, { maxRequests: 3, windowMs: 60_000 });

    expect(await limitador.tryConsume(chave)).toBe(true);
    expect(await limitador.tryConsume(chave)).toBe(true);
    expect(await limitador.tryConsume(chave)).toBe(true);
    expect(await limitador.tryConsume(chave)).toBe(false);
  });

  // A razão de existir desta implementação, em um teste.
  it('a cota é a MESMA para duas instâncias — é o que a de memória não fazia', async () => {
    const outraChave = `${chave}-dois-processos`;
    // Duas instâncias, como dois processos do servidor atrás de um balanceador.
    const processoA = createPostgresRateLimiter(pool, { maxRequests: 2, windowMs: 60_000 });
    const processoB = createPostgresRateLimiter(pool, { maxRequests: 2, windowMs: 60_000 });

    expect(await processoA.tryConsume(outraChave)).toBe(true);
    expect(await processoB.tryConsume(outraChave)).toBe(true);
    // O terceiro pedido cai, tenha ele chegado em qual processo for. Com o limitador em
    // memória, os dois primeiros teriam sido contados em contadores DIFERENTES e este aqui
    // passaria — o teto de 2 valeria 4.
    expect(await processoB.tryConsume(outraChave)).toBe(false);
    expect(await processoA.tryConsume(outraChave)).toBe(false);
  });

  it('conta por chave, como o de memória', async () => {
    const limitador = createPostgresRateLimiter(pool, { maxRequests: 1, windowMs: 60_000 });
    const a = `${chave}-a`;
    const b = `${chave}-b`;

    expect(await limitador.tryConsume(a)).toBe(true);
    expect(await limitador.tryConsume(a)).toBe(false);
    expect(await limitador.tryConsume(b)).toBe(true);
  });

  it('requisições SIMULTÂNEAS não furam o teto', async () => {
    // Perguntar primeiro e escrever depois abriria a fresta em que duas leem o mesmo número
    // e passam as duas. Contar e inserir na mesma instrução é o que fecha.
    const simultaneas = `${chave}-simultaneas`;
    const limitador = createPostgresRateLimiter(pool, { maxRequests: 5, windowMs: 60_000 });

    const resultados = await Promise.all(Array.from({ length: 20 }, () => limitador.tryConsume(simultaneas)));

    expect(resultados.filter(Boolean)).toHaveLength(5);
  });
});
