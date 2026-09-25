import { describe, expect, it } from 'vitest';
import { INITIAL_CHOICE, advanceChoice, choosableEntries, redeemChoice, type ChoiceState } from '../src/index.js';
import { generico } from './fixtures.js';

// M38 3/N (D54/D55) — A ESCOLHA DO GENÉRICO, a cada 180 rolagens.
//
// - Contador PRÓPRIO, separado do soft pity: tirar um prêmio no caminho não o zera.
// - Zera ao conceder, e é repetível: a cada 180, uma escolha nova.
// - A escolha é de qualquer entrada `hero` do pool do genérico — personagem ou artefato.

function rolar(estado: ChoiceState, vezes: number): ChoiceState {
  for (let i = 0; i < vezes; i++) estado = advanceChoice(estado, generico.choiceEvery);
  return estado;
}

describe('o contador da escolha', () => {
  it('começa zerado e sem escolha pendente', () => {
    expect(INITIAL_CHOICE).toEqual({ rolls: 0, pending: 0 });
  });

  it('concede uma escolha na 180ª rolagem, e zera o contador ao conceder', () => {
    expect(rolar(INITIAL_CHOICE, 179)).toEqual({ rolls: 179, pending: 0 });
    expect(rolar(INITIAL_CHOICE, 180)).toEqual({ rolls: 0, pending: 1 });
  });

  it('é repetível: 360 rolagens sem resgatar acumulam duas', () => {
    expect(rolar(INITIAL_CHOICE, 360)).toEqual({ rolls: 0, pending: 2 });
  });

  it('não depende do que saiu no caminho: a função nem recebe o resultado da rolagem', () => {
    // A forma é a prova. `advanceChoice` só conhece o estado e o intervalo.
    expect(advanceChoice.length).toBe(2);
  });
});

describe('o resgate', () => {
  const comUma: ChoiceState = { rolls: 17, pending: 1 };

  it('as escolhas possíveis são as entradas `hero` do pool — personagem e artefato', () => {
    expect(choosableEntries(generico).map((e) => e.characterId ?? e.artifactId).sort()).toEqual(['art-g', 'char-g']);
  });

  it('resgatar um personagem novo entrega o personagem e consome UMA escolha, sem tocar no contador', () => {
    const r = redeemChoice(generico, comUma, 'char-g', [], []);
    expect(r).toEqual({
      ok: true,
      state: { rolls: 17, pending: 0 },
      outcome: { kind: 'character', characterId: 'char-g', rank: 'hero' },
    });
  });

  it('resgatar um artefato que já tem paga o fragmento dele', () => {
    const r = redeemChoice(generico, comUma, 'art-g', [], ['art-g']);
    expect(r.ok && r.outcome).toEqual({
      kind: 'artifactDuplicate',
      artifactId: 'art-g',
      rank: 'hero',
      fragmentMaterialId: 'frag-art-g',
    });
  });

  it('recusa sem escolha pendente', () => {
    expect(redeemChoice(generico, { rolls: 100, pending: 0 }, 'char-g', [], [])).toEqual({
      ok: false,
      reason: 'sem-escolha',
    });
  });

  it('recusa `Adventurer` e id fora do pool', () => {
    expect(redeemChoice(generico, comUma, 'char-a', [], [])).toEqual({ ok: false, reason: 'fora-do-pool' });
    expect(redeemChoice(generico, comUma, 'char-inexistente', [], [])).toEqual({ ok: false, reason: 'fora-do-pool' });
  });
});
