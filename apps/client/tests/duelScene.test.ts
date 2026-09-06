import { describe, expect, it } from 'vitest';
import {
  FX_MS,
  FX_PICO_EM,
  IDLE_MS,
  duelBeats,
  duelSceneBeats,
  fxMotion,
  idleMotion,
  instantly,
  weightFor,
  type DuelChoreographyInput,
} from '../src/data/motion.js';

// M26 2/N — o repouso, o efeito e as batidas da TELA de duelo.
//
// A tela nasceu de uma medida: os quadros gerados perdem a arma em qualquer resolução (D27), e
// §6.1 faz a arma decidir o alcance no duelo. A saída foi tirar a identidade da arma dos pixels
// e pôr no EFEITO, que é código. Este arquivo cobra o tempo dessa camada; `combatFx.test.ts`
// cobra a forma dela.
//
// Tudo aqui é função pura de tempo — nenhum import de Pixi, nenhum browser —, exatamente como
// M16 3/N estabeleceu. Quem tem relógio é o `MapCanvas`.

function duelo(overrides: Partial<DuelChoreographyInput> = {}): DuelChoreographyInput {
  return {
    attackerId: 'a',
    defenderId: 'd',
    trocas: [],
    finalHpAttacker: 500,
    finalHpDefender: 500,
    ...overrides,
  };
}

function acao(o: Partial<DuelChoreographyInput['trocas'][number]['actions'][number]> = {}) {
  return { actorId: 'a', targetId: 'd', damage: 0, reaction: null, ...o };
}

describe('a respiração (idle)', () => {
  it('nunca termina: quem para o repouso é quem começa outra coisa', () => {
    const m = idleMotion(weightFor('infantry'));
    for (const t of [0, 500, IDLE_MS, IDLE_MS * 7.3]) {
      expect(m.sampleAt(t).done, String(t)).toBe(false);
    }
  });

  it('é um CICLO: o mesmo instante de dois ciclos diferentes dá a mesma amostra', () => {
    const m = idleMotion(weightFor('infantry'));
    const a = m.sampleAt(300);
    const b = m.sampleAt(300 + m.durationMs * 3);
    expect(b.scaleY).toBeCloseTo(a.scaleY, 9);
    expect(b.dy).toBeCloseTo(a.dy, 9);
  });

  it('a amplitude é pequena — respirar não pode competir com ler o tabuleiro', () => {
    // §1.1 põe legibilidade tática entre os pilares. Dez unidades respirando forte é ruído
    // constante, e o olho passa a ser puxado pela animação em vez de pela posição.
    const m = idleMotion(weightFor('infantry'));
    let maxEscala = 0;
    for (let t = 0; t < m.durationMs; t += 10) {
      maxEscala = Math.max(maxEscala, Math.abs(m.sampleAt(t).scaleY - 1));
    }
    expect(maxEscala).toBeLessThan(0.03);
  });

  it('não desloca no eixo X: respirar não anda', () => {
    const m = idleMotion(weightFor('armored'));
    for (let t = 0; t < m.durationMs; t += 37) expect(m.sampleAt(t).dx).toBe(0);
  });

  it('estica para cima e achata junto — peito enchendo, não gelatina', () => {
    // Só escalar nos dois eixos dá bola inflando. O que faz parecer respiração é `scaleY` e
    // `scaleX` andarem em sentidos OPOSTOS, e a peça subir um triz com a expansão.
    const m = idleMotion(weightFor('infantry'));
    const pico = m.sampleAt(m.durationMs / 4);
    expect(pico.scaleY).toBeGreaterThan(1);
    expect(pico.scaleX).toBeLessThan(1);
    expect(pico.dy).toBeLessThan(0);
  });

  it('o peso muda o ritmo: o couraçado respira mais devagar que o mensageiro', () => {
    // Mesma tabela de perfis de M16 3/N, que já ordena os cinco. Se o idle ignorasse o peso,
    // as cinco classes respirariam igual e a tabela viraria decoração.
    expect(idleMotion(weightFor('armored')).durationMs).toBeGreaterThan(
      idleMotion(weightFor('cavalry')).durationMs,
    );
  });

  it('sobrevive a tempo negativo sem explodir', () => {
    // Um `elapsedMs` negativo aparece quando o relógio do Pixi reinicia; `%` em JS devolve
    // negativo, e sem o ajuste a peça daria um salto.
    const m = idleMotion(weightFor('infantry'));
    const s = m.sampleAt(-500);
    expect(Number.isFinite(s.scaleY)).toBe(true);
    expect(Math.abs(s.scaleY - 1)).toBeLessThan(0.03);
  });
});

describe('o efeito de combate', () => {
  it('surge, fica e some — e some ATÉ ZERO', () => {
    // Um efeito que termina com alpha residual deixa sujeira na camada de FX, e a sujeira se
    // acumula golpe a golpe.
    const m = fxMotion();
    expect(m.sampleAt(0).alpha).toBe(0);
    expect(m.sampleAt(FX_MS * FX_PICO_EM).alpha).toBeCloseTo(1, 1);
    expect(m.sampleAt(FX_MS).alpha).toBe(0);
    expect(m.sampleAt(FX_MS).done).toBe(true);
  });

  it('o pico vem CEDO: o jogador tem de ver o efeito no instante do golpe', () => {
    // A curva é o oposto da de impacto. `impactMotion` acelera até o meio porque a peça vai e
    // volta; o efeito não vai a lugar nenhum — ele aparece.
    const m = fxMotion();
    const instantePico = FX_MS * FX_PICO_EM;
    expect(instantePico).toBeLessThan(FX_MS / 2);
  });

  it('abre enquanto some — dissipa em vez de ser apagado', () => {
    const m = fxMotion();
    const meio = m.sampleAt(FX_MS * 0.6);
    const fim = m.sampleAt(FX_MS * 0.9);
    expect(fim.scaleX).toBeGreaterThan(meio.scaleX);
    expect(fim.alpha).toBeLessThan(meio.alpha);
  });

  it('§11 — o modo instantâneo pula o efeito e chega ao MESMO estado final', () => {
    // "Modo resultado instantâneo (pula animações), essencial para farm" é requisito duro, e
    // `instantly` já era a operação sobre a descrição desde M16 3/N. O efeito entra por ela,
    // e não por um `if` espalhado pela cena.
    const pulado = instantly(fxMotion());
    expect(pulado.durationMs).toBe(0);
    expect(pulado.sampleAt(0)).toEqual(fxMotion().sampleAt(FX_MS));
  });

  it('a duração é curta — o efeito não pode virar espera', () => {
    // Três trocas com golpe e contra-golpe são até seis efeitos por duelo. A soma é o que o
    // jogador sente, e é ela que decide se ele vai desligar a tela.
    expect(FX_MS).toBeLessThanOrEqual(300);
  });
});

describe('as batidas da tela de duelo', () => {
  const comEsquiva = duelo({
    trocas: [{ actions: [acao({ damage: 0, hit: false, skillId: 'skill-ataque' })] }],
  });

  it('a ESQUIVA vira batida na tela — e §8 depende disso', () => {
    // §8 dá à `spd` exatamente três benefícios, e a evasão com teto é um deles. Se o jogador
    // nunca vê a evasão acontecer, o stat vira número de planilha.
    const beats = duelSceneBeats(comEsquiva);
    expect(beats.map((b) => b.kind)).toEqual(['miss']);
  });

  it('...e NÃO vira batida no tabuleiro — a regra de M16 3/N fica de pé', () => {
    // "Sacudir a peça num golpe que a evasão fez errar seria a animação afirmando o contrário
    // do que o core decidiu." A tela mostra; o tabuleiro não sacode.
    expect(duelBeats(comEsquiva)).toEqual([]);
  });

  it('PARIDADE: filtrar as batidas da tela pelo dano devolve as do tabuleiro', () => {
    // Duas leituras do mesmo log podem divergir sem que nada quebre — e a divergência
    // apareceria como a tela contando um duelo e o tabuleiro contando outro. §9.1 chama isso
    // de bug crítico; este teste é a trava.
    const completo = duelo({
      trocas: [
        {
          actions: [
            acao({ damage: 120, isCrit: true, skillId: 'skill-a', reaction: { counterDamage: 40, healDone: null } }),
            acao({ actorId: 'd', targetId: 'a', damage: 0, hit: false }),
            acao({ damage: 0, heal: 90 }),
          ],
        },
        { actions: [acao({ actorId: 'd', targetId: 'a', damage: 75 })] },
      ],
      finalHpDefender: 0,
    });

    const daTela = duelSceneBeats(completo).filter((b) => b.kind !== 'miss');
    const doTabuleiro = duelBeats(completo);

    expect(daTela.length).toBe(doTabuleiro.length);
    daTela.forEach((b, i) => {
      const t = doTabuleiro[i]!;
      expect([b.actorId, b.targetId, b.damage, b.kind]).toEqual([t.actorId, t.targetId, t.damage, t.kind]);
    });
  });

  it('o crítico viaja na batida — a tela precisa dele e o tabuleiro nunca precisou', () => {
    const beats = duelSceneBeats(duelo({ trocas: [{ actions: [acao({ damage: 200, isCrit: true })] }] }));
    expect(beats[0]!.crit).toBe(true);
  });

  it('a skill que disparou viaja junto: a tela diz o NOME do que aconteceu', () => {
    const beats = duelSceneBeats(duelo({ trocas: [{ actions: [acao({ damage: 10, skillId: 'skill-especial' })] }] }));
    expect(beats[0]!.skillId).toBe('skill-especial');
  });

  it('entrada ANTIGA (sem `hit`, sem `isCrit`) continua valendo, e não inventa esquiva', () => {
    // Os três campos são aditivos de propósito: fixture de M16 não muda, e uma ação sem `hit`
    // não pode virar uma esquiva que ninguém registrou.
    const beats = duelSceneBeats(duelo({ trocas: [{ actions: [acao({ damage: 0 })] }] }));
    expect(beats).toEqual([]);
  });

  it('a ordem é a do log: contra-ataque DEPOIS do golpe que o disparou', () => {
    // §6.4. Desenhar a reação antes faria o contra-ataque parecer parte do ataque.
    const beats = duelSceneBeats(
      duelo({ trocas: [{ actions: [acao({ damage: 50, reaction: { counterDamage: 30, healDone: null } })] }] }),
    );
    expect(beats.map((b) => b.kind)).toEqual(['strike', 'counter']);
    expect(beats[1]!.actorId).toBe('d');
  });

  it('os dois podem morrer no mesmo duelo (§6.4 — contra-golpe letal)', () => {
    const beats = duelSceneBeats(duelo({ finalHpAttacker: 0, finalHpDefender: 0 }));
    expect(beats.map((b) => b.kind)).toEqual(['death', 'death']);
  });

  it('é pura: o mesmo log devolve as mesmas batidas', () => {
    expect(duelSceneBeats(comEsquiva)).toEqual(duelSceneBeats(comEsquiva));
  });
});
