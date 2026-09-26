import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import economySchema from '../schemas/economy-rules.schema.js';
import enemySchema from '../schemas/enemies.schema.js';
import materialSchema from '../schemas/materials.schema.js';

// M39 1/N — A SUBIDA DE NÍVEL, do lado do dado: o NÍVEL do inimigo (o exp de uma instância é a
// soma dos inimigos dela, cada um pelo nível), os TOMOS de experiência e a CURVA.

const ler = (caminho: string) => JSON.parse(readFileSync(new URL(caminho, import.meta.url), 'utf8'));
const economia = ler('../economy-rules/economy.json');
const inimigos = readdirSync(new URL('../enemies/', import.meta.url)).map((f) => ler(`../enemies/${f}`));
const umInimigo = inimigos[0];

describe('o nível do inimigo', () => {
  it('é obrigatório, inteiro, de 1 a 60', () => {
    const { level: _fora, ...sem } = umInimigo;
    expect(enemySchema.safeParse(sem).success).toBe(false);
    for (const level of [0, 61, 10.5]) expect(enemySchema.safeParse({ ...umInimigo, level }).success, String(level)).toBe(false);
    expect(enemySchema.safeParse({ ...umInimigo, level: 12 }).success).toBe(true);
  });

  it('todo inimigo do conteúdo declara o dele', () => {
    for (const inimigo of inimigos) expect(Number.isInteger(inimigo.level), inimigo.id).toBe(true);
  });
});

describe('o tomo de experiência', () => {
  const tomo = { id: 'material-tomo-x', name: 'Tomo', kind: 'expTome', exp: 500 };

  it('declara o exp que dá, inteiro e positivo', () => {
    expect(materialSchema.safeParse(tomo).success).toBe(true);
    expect(materialSchema.safeParse({ ...tomo, exp: undefined }).success).toBe(false);
    expect(materialSchema.safeParse({ ...tomo, exp: 0 }).success).toBe(false);
    expect(materialSchema.safeParse({ ...tomo, exp: 12.5 }).success).toBe(false);
  });

  it('`exp` é proibido nos outros kinds', () => {
    expect(materialSchema.safeParse({ id: 'm', name: 'M', kind: 'generic', exp: 100 }).success).toBe(false);
  });

  it('os três tomos do conteúdo: Pequeno 500, Médio 2.000, Grande 8.000 (decisão do usuário)', () => {
    const tomos = readdirSync(new URL('../materials/', import.meta.url))
      .map((f) => ler(`../materials/${f}`))
      .filter((m) => m.kind === 'expTome')
      .map((m) => m.exp)
      .sort((a: number, b: number) => a - b);
    expect(tomos).toEqual([500, 2000, 8000]);
  });
});

describe('a curva de exp', () => {
  it('está em economy.json e o schema a exige', () => {
    expect(economySchema.safeParse(economia).success).toBe(true);
    const { experiencia: _fora, ...sem } = economia;
    expect(economySchema.safeParse(sem).success).toBe(false);
  });

  it('cobre do nível 1 ao 60: 59 degraus, inteiros e positivos', () => {
    expect(economia.experiencia.expParaProximo).toHaveLength(59);
    for (const custo of economia.experiencia.expParaProximo) expect(Number.isInteger(custo) && custo > 0).toBe(true);
  });

  it('nunca fica mais barato subir: a curva não desce', () => {
    const c: number[] = economia.experiencia.expParaProximo;
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
  });

  it('é a proposta aceita: do L para o L+1 custa 1000 + 100·(L−10) a partir do 10', () => {
    const c: number[] = economia.experiencia.expParaProximo;
    expect(c[9]).toBe(1000); // 10 → 11
    expect(c[19]).toBe(2000); // 20 → 21
    expect(c.slice(9, 19).reduce((a, b) => a + b, 0)).toBe(14_500); // 10 → 20
  });

  it('o inimigo vale 20 de exp por nível', () => {
    expect(economia.experiencia.porNivelDeInimigo).toBe(20);
  });
});

describe('a Campo de Treino dá TOMOS, não exp cru', () => {
  const masmorras = readdirSync(new URL('../dungeons/', import.meta.url)).map((f) => ler(`../dungeons/${f}`));

  it('nenhuma masmorra declara exp cru: o exp vem dos inimigos e dos tomos', () => {
    for (const m of masmorras) expect(m.exp, m.id).toBeUndefined();
  });

  it('a normal dropa Tomos Pequenos; a elite, Médios e a chance de um Grande', () => {
    const normal = masmorras.find((m) => m.id === 'dungeon-campo-de-treino');
    const elite = masmorras.find((m) => m.id === 'dungeon-campo-de-treino-elite');
    expect(normal.materialDrops.map((d: { materialId: string }) => d.materialId)).toEqual(['material-tomo-pequeno']);
    expect(elite.materialDrops.map((d: { materialId: string }) => d.materialId).sort()).toEqual([
      'material-tomo-grande',
      'material-tomo-medio',
    ]);
  });
});
