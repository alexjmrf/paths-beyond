import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import compSchema from '../schemas/comps.schema.js';

const comp = JSON.parse(readFileSync(new URL('../comps/comp-guerreiro.json', import.meta.url), 'utf8')) as {
  readonly units: readonly Record<string, unknown>[];
};

// M38 5/N — a unidade de comp declara o ARTEFATO que leva na medição com artefato. É da classe
// dela, e não necessariamente a assinatura (decisão do usuário); a escolha fica no dado, à
// vista. Se é da classe certa e se existe é validação cruzada, em `packages/content`.

const unidade = comp.units[0]!;

describe('comps.schema — o artefato da unidade', () => {
  it('aceita a unidade com `artifactId`', () => {
    const r = compSchema.safeParse({ ...comp, units: [{ ...unidade, artifactId: 'artifact-machado-do-tirano' }] });
    expect(r.success).toBe(true);
    // O schema não é `.strict()`: sem declarar o campo, ele seria DESCARTADO em silêncio e o
    // torneio nunca o veria. É isto que pega.
    expect(r.success && r.data.units[0]?.artifactId).toBe('artifact-machado-do-tirano');
  });

  it('aceita a unidade sem `artifactId` (a medição sem artefato não precisa dele)', () => {
    const { artifactId: _fora, ...sem } = unidade;
    expect(compSchema.safeParse({ ...comp, units: [sem] }).success).toBe(true);
  });

  it('recusa `artifactId` vazio', () => {
    expect(compSchema.safeParse({ ...comp, units: [{ ...unidade, artifactId: '' }] }).success).toBe(false);
  });
});
