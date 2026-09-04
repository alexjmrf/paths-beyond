import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import {
  DEATH_MS,
  DAMAGE_FLOAT_MS,
  FALLBACK_WEIGHT,
  IMPACT_PEAK_AT,
  WEIGHT_BY_UNIT_TYPE,
  damageAnchorDirection,
  damageNumberMotion,
  deathMotion,
  duelBeats,
  impactMotion,
  instantly,
  moveMotion,
  shakeMotion,
  weightFor,
  type Motion,
  type MotionSample,
  type Point,
  type WeightProfile,
} from '../src/data/motion.js';

// M16, sub-sessão 3/N — animação com peso.
//
// Este arquivo existe porque "com peso" é uma afirmação sobre MOVIMENTO, e movimento é a coisa
// que menos se deixa julgar por screenshot: um quadro parado não mostra se a unidade acelerou,
// se recuou antes de bater ou se parou seca no destino. §3 do briefing proíbe o agente de
// autocertificar estética — mas peso tem um lado mensurável, e é ele que está aqui:
//
//   - a velocidade tem um pico no meio do percurso (é isso que separa peso de interpolação
//     linear, que é o que o cliente fazia desde M6);
//   - o golpe RECUA antes de avançar (antecipação), e a antecipação é uma quantidade com sinal;
//   - o pesado demora mais, recua mais, assenta mais e treme menos que o leve — a tabela de
//     perfis é uma declaração ordenada, não uma coleção de números soltos;
//   - toda animação termina EXATAMENTE onde o estado do core diz que ela termina.
//
// O que não está aqui é qualquer asserção sobre o resultado ser bonito. Isso é gosto, é do
// usuário, e o critério de aceite 2 só fecha com a palavra dele.
//
// Mesma inversão do D2 (a costura de representação): o módulo DESCREVE o movimento — uma função
// pura de tempo decorrido para deslocamento/escala/opacidade — e não anima. Quem tem relógio é
// o `MapCanvas`, num ponto só. É o que torna este arquivo possível sem browser e sem Pixi.

const TILE = 36;

function amostras(motion: Motion, passos: number): readonly MotionSample[] {
  return Array.from({ length: passos + 1 }, (_, i) => motion.sampleAt((motion.durationMs * i) / passos));
}

function reta(tiles: number): readonly Point[] {
  return Array.from({ length: tiles + 1 }, (_, i) => ({ x: i * TILE + TILE / 2, y: TILE / 2 }));
}

const INFANTARIA = WEIGHT_BY_UNIT_TYPE.infantry;

// ---------------------------------------------------------------------------
// Os perfis de peso
// ---------------------------------------------------------------------------

describe('perfis de peso por tipo de unidade', () => {
  it('declara os 5 `UnitType` do core, nem um a mais nem um a menos', () => {
    // O `Record<UnitType, _>` já obriga em tempo de compilação; esta asserção é o outro lado,
    // o de M9: uma chave a mais é lixo que ninguém lê, e o dia em que `UnitType` ganhar um
    // valor novo o teste fala antes de a unidade nova andar com o peso errado por omissão.
    expect(Object.keys(WEIGHT_BY_UNIT_TYPE).sort()).toEqual(
      ['armored', 'cavalry', 'caster', 'flying', 'infantry'].sort(),
    );
  });

  it('todo `unitType` que o catálogo real usa tem perfil próprio, sem cair no fallback', () => {
    const usados = [...new Set(Object.values(catalog.classes).map((c) => c.unitType))];
    expect(usados.length).toBeGreaterThan(0);
    const semPerfil = usados.filter((t) => WEIGHT_BY_UNIT_TYPE[t] === undefined);
    expect(semPerfil).toEqual([]);
  });

  it('`weightFor` cai no fallback declarado quando a unidade não diz o tipo', () => {
    // PvP, masmorra e replay recebem o `BattleSetup` pronto; nem toda unidade que chega ao
    // tabuleiro traz tudo preenchido, e uma unidade sem perfil não pode ficar sem movimento.
    expect(weightFor(undefined)).toBe(FALLBACK_WEIGHT);
    expect(weightFor('armored')).toBe(WEIGHT_BY_UNIT_TYPE.armored);
  });

  it('pesado é pesado: o couraçado demora mais, recua mais e assenta mais que o alado', () => {
    // É esta ordem que faz "peso" querer dizer alguma coisa. Sem ela a tabela seria cinco
    // cópias do mesmo número com nomes diferentes, e o milestone teria animação sem peso.
    const pesado = WEIGHT_BY_UNIT_TYPE.armored;
    const leve = WEIGHT_BY_UNIT_TYPE.flying;

    expect(pesado.msPerTile).toBeGreaterThan(leve.msPerTile);
    expect(pesado.settle).toBeGreaterThan(leve.settle);
    expect(pesado.anticipation).toBeGreaterThan(leve.anticipation);
    // E treme MENOS ao apanhar: massa é o que absorve o golpe. Se o couraçado sacudisse como
    // o grifeiro, o peso apareceria só na ida e sumiria na volta.
    expect(pesado.shake).toBeLessThan(leve.shake);
  });

  it('nenhum perfil tem duração zero ou amplitude negativa', () => {
    const perfis: readonly WeightProfile[] = [...Object.values(WEIGHT_BY_UNIT_TYPE), FALLBACK_WEIGHT];
    for (const p of perfis) {
      expect(p.msPerTile).toBeGreaterThan(0);
      expect(p.impactMs).toBeGreaterThan(0);
      for (const fracao of [p.settle, p.anticipation, p.shake]) {
        expect(fracao).toBeGreaterThan(0);
        expect(fracao).toBeLessThan(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Movimento
// ---------------------------------------------------------------------------

describe('movimento com peso', () => {
  it('termina EXATAMENTE no destino', () => {
    // Uma deriva de meio pixel entre o fim da animação e o commit do estado do core produz um
    // salto no último quadro — e o salto é justamente onde o jogador está olhando. Exatidão
    // aqui não é preciosismo: é o que permite ao `MapCanvas` commitar sem corrigir nada.
    const path = reta(4);
    const m = moveMotion(path, INFANTARIA);
    const fim = m.sampleAt(m.durationMs);

    expect(fim.dx).toBe(path[4]!.x - path[0]!.x);
    expect(fim.dy).toBe(path[4]!.y - path[0]!.y);
    expect(fim.scaleX).toBe(1);
    expect(fim.scaleY).toBe(1);
    expect(fim.alpha).toBe(1);
    expect(fim.done).toBe(true);
  });

  it('começa exatamente na origem, parada', () => {
    const m = moveMotion(reta(3), INFANTARIA);
    expect(m.sampleAt(0)).toEqual({ dx: 0, dy: 0, scaleX: 1, scaleY: 1, alpha: 1, done: false });
  });

  it('avança sem nunca voltar atrás, inclusive num caminho que vira', () => {
    // O caminho que o `computeReachableTiles` devolve dobra esquinas. Interpolar por segmento
    // (o que o cliente fazia) dá uma parada dura em cada tile; interpolar pelo comprimento de
    // arco inteiro só vale se o comprimento percorrido for monotônico nas curvas também.
    const cotovelo: readonly Point[] = [
      { x: 18, y: 18 },
      { x: 54, y: 18 },
      { x: 90, y: 18 },
      { x: 90, y: 54 },
      { x: 90, y: 90 },
    ];
    const m = moveMotion(cotovelo, INFANTARIA);
    let anterior = -1;
    for (const s of amostras(m, 60)) {
      const percorrido = Math.abs(s.dx) + Math.abs(s.dy); // o caminho é ortogonal
      expect(percorrido).toBeGreaterThanOrEqual(anterior - 1e-9);
      anterior = percorrido;
    }
    expect(anterior).toBeCloseTo(72 + 72, 6);
  });

  it('a velocidade tem um pico no MEIO — é isto que separa peso de lerp', () => {
    // A trava da fatia inteira. Com interpolação linear, as três velocidades abaixo seriam
    // iguais; com peso, a unidade sai devagar, ganha o percurso e freia na chegada.
    const m = moveMotion(reta(4), INFANTARIA);
    const dt = m.durationMs / 200;
    const velocidade = (t: number) => (m.sampleAt(t + dt).dx - m.sampleAt(t).dx) / dt;

    const largada = velocidade(m.durationMs * 0.02);
    const meio = velocidade(m.durationMs * 0.5);
    const chegada = velocidade(m.durationMs * 0.96);

    expect(meio).toBeGreaterThan(largada * 2);
    expect(meio).toBeGreaterThan(chegada * 2);
    expect(largada).toBeGreaterThan(0);
  });

  it('assenta na chegada — e o assentamento volta ao normal, sem deixar a peça deformada', () => {
    const m = moveMotion(reta(3), WEIGHT_BY_UNIT_TYPE.armored);
    const escalas = amostras(m, 80).map((s) => s.scaleY);
    // Em algum ponto perto do fim a peça achata (a massa chegando ao chão)...
    expect(Math.min(...escalas)).toBeLessThan(0.99);
    // ...e nunca vira do avesso nem some.
    expect(Math.min(...escalas)).toBeGreaterThan(0.5);
    // ...e o último quadro é a peça inteira de novo. Sem isto, a unidade ficaria achatada no
    // tabuleiro depois de andar, porque o commit acontece no fim da animação.
    expect(escalas[escalas.length - 1]).toBe(1);
  });

  it('a duração é proporcional ao caminho e ao peso de quem anda', () => {
    expect(moveMotion(reta(4), INFANTARIA).durationMs).toBe(INFANTARIA.msPerTile * 4);
    expect(moveMotion(reta(4), WEIGHT_BY_UNIT_TYPE.armored).durationMs).toBeGreaterThan(
      moveMotion(reta(4), WEIGHT_BY_UNIT_TYPE.flying).durationMs,
    );
  });

  it('caminho degenerado não produz movimento nem `NaN`', () => {
    // `moveSelectedUnitTo` no próprio tile, e caminho vazio vindo de um estado inesperado. A
    // mesma disciplina de `hpFraction` em 2/N: o Pixi desenha `NaN` como nada, ou seja, um bug
    // que só aparece em jogo.
    for (const path of [[] as readonly Point[], reta(0)]) {
      const m = moveMotion(path, INFANTARIA);
      expect(m.durationMs).toBe(0);
      const s = m.sampleAt(0);
      expect(s.dx).toBe(0);
      expect(s.dy).toBe(0);
      expect(s.done).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Impacto
// ---------------------------------------------------------------------------

describe('impacto do duelo', () => {
  const direita: Point = { x: 1, y: 0 };

  it('RECUA antes de avançar — a antecipação é uma quantidade com sinal', () => {
    // O que faz um golpe ter peso não é a ida, é o que vem antes dela. Sem antecipação a peça
    // só desliza; com ela, o jogador vê a unidade tomar impulso.
    const m = impactMotion(direita, TILE, INFANTARIA);
    const antes = amostras(m, 60).slice(0, Math.floor(60 * IMPACT_PEAK_AT));
    expect(Math.min(...antes.map((s) => s.dx))).toBeLessThan(0);
  });

  it('bate na direção do alvo e volta para o lugar, exatamente', () => {
    const m = impactMotion(direita, TILE, INFANTARIA);
    const todas = amostras(m, 100);

    expect(Math.max(...todas.map((s) => s.dx))).toBeGreaterThan(TILE * 0.15);
    // O golpe é a maior excursão do movimento, e cai onde `IMPACT_PEAK_AT` promete — é isso
    // que o `MapCanvas` usa para sincronizar o tremor do alvo e o número de dano com a batida.
    expect(m.sampleAt(m.durationMs * IMPACT_PEAK_AT).dx).toBeCloseTo(Math.max(...todas.map((s) => s.dx)), 6);
    // E termina em cima do próprio tile: o atacante não anda, ele bate. Se sobrasse deslocamento
    // aqui, a peça acabaria fora do tile que o core diz que ela ocupa.
    expect(m.sampleAt(m.durationMs).dx).toBe(0);
    expect(m.sampleAt(m.durationMs).dy).toBe(0);
    expect(m.sampleAt(m.durationMs).done).toBe(true);
  });

  it('bate no eixo certo, para qualquer um dos quatro vizinhos', () => {
    for (const dir of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ] as const) {
      const pico = impactMotion(dir, TILE, INFANTARIA).sampleAt(INFANTARIA.impactMs * IMPACT_PEAK_AT);
      expect(Math.sign(pico.dx), `dx de (${dir.x},${dir.y})`).toBe(Math.sign(dir.x));
      expect(Math.sign(pico.dy), `dy de (${dir.x},${dir.y})`).toBe(Math.sign(dir.y));
    }
  });

  it('direção nula não produz deslocamento nem `NaN`', () => {
    // Duas unidades no mesmo tile não existem em jogo, mas normalizar um vetor nulo divide por
    // zero — e o resultado seria uma peça desenhada em lugar nenhum.
    for (const s of amostras(impactMotion({ x: 0, y: 0 }, TILE, INFANTARIA), 20)) {
      expect(Number.isFinite(s.dx)).toBe(true);
      expect(s.dx).toBe(0);
      expect(s.dy).toBe(0);
    }
  });

  it('o couraçado bate mais devagar e recua mais fundo que o grifeiro', () => {
    const pesado = impactMotion(direita, TILE, WEIGHT_BY_UNIT_TYPE.armored);
    const leve = impactMotion(direita, TILE, WEIGHT_BY_UNIT_TYPE.flying);
    expect(pesado.durationMs).toBeGreaterThan(leve.durationMs);

    const recuo = (m: Motion) => Math.min(...amostras(m, 60).map((s) => s.dx));
    expect(recuo(pesado)).toBeLessThan(recuo(leve));
  });
});

describe('tremor de quem apanha', () => {
  it('oscila, amortece e para exatamente onde começou', () => {
    const m = shakeMotion(TILE, INFANTARIA);
    const todas = amostras(m, 120);
    const sinais = todas.map((s) => Math.sign(s.dx)).filter((n) => n !== 0);

    // Oscilação: o tremor troca de lado. Um deslocamento só para um lado é um empurrão.
    let trocas = 0;
    for (let i = 1; i < sinais.length; i++) if (sinais[i] !== sinais[i - 1]) trocas++;
    expect(trocas).toBeGreaterThanOrEqual(2);

    // Amortecimento: a segunda metade treme menos que a primeira.
    const amplitude = (fatia: readonly MotionSample[]) => Math.max(...fatia.map((s) => Math.abs(s.dx)));
    expect(amplitude(todas.slice(0, 60))).toBeGreaterThan(amplitude(todas.slice(60)));

    expect(m.sampleAt(m.durationMs).dx).toBe(0);
    expect(m.sampleAt(m.durationMs).dy).toBe(0);
  });

  it('o couraçado treme menos que o grifeiro, com a mesma pancada', () => {
    const pico = (w: WeightProfile) => Math.max(...amostras(shakeMotion(TILE, w), 80).map((s) => Math.abs(s.dx)));
    expect(pico(WEIGHT_BY_UNIT_TYPE.armored)).toBeLessThan(pico(WEIGHT_BY_UNIT_TYPE.flying));
  });

  it('não transborda para o tile vizinho', () => {
    // O tremor é apresentação em cima de um tabuleiro onde posição é REGRA. Uma peça que
    // invade o tile ao lado mente sobre quem está onde — o mesmo princípio que travou a
    // hachura de ameaça em 2/N.
    for (const w of Object.values(WEIGHT_BY_UNIT_TYPE)) {
      for (const s of amostras(shakeMotion(TILE, w), 80)) {
        expect(Math.abs(s.dx)).toBeLessThan(TILE / 2);
        expect(Math.abs(s.dy)).toBeLessThan(TILE / 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Morte e número de dano
// ---------------------------------------------------------------------------

describe('morte', () => {
  it('desvanece até sumir de vez e desaba sem virar do avesso', () => {
    // Até esta fatia a unidade morta simplesmente DESAPARECIA no mesmo quadro em que o duelo
    // era commitado: o jogador via o tabuleiro com uma peça a menos e tinha de deduzir qual.
    const m = deathMotion(TILE, INFANTARIA);
    const todas = amostras(m, 40);

    for (let i = 1; i < todas.length; i++) expect(todas[i]!.alpha).toBeLessThanOrEqual(todas[i - 1]!.alpha);
    expect(todas[0]!.alpha).toBe(1);
    expect(todas[todas.length - 1]!.alpha).toBe(0);

    expect(Math.min(...todas.map((s) => s.scaleY))).toBeGreaterThan(0);
    expect(todas[todas.length - 1]!.scaleY).toBeLessThan(todas[0]!.scaleY);
    expect(m.durationMs).toBe(DEATH_MS);
  });
});

describe('número de dano', () => {
  it('sobe e some, e some por completo', () => {
    // Decisão do usuário nesta fatia (o briefing não lista número de dano). O argumento: sem
    // ele a batida é sacudida sem tamanho — o jogador vê que doeu e não quanto.
    const m = damageNumberMotion(TILE);
    const todas = amostras(m, 40);

    for (let i = 1; i < todas.length; i++) expect(todas[i]!.dy).toBeLessThanOrEqual(todas[i - 1]!.dy + 1e-9);
    expect(todas[todas.length - 1]!.dy).toBeLessThan(0); // sobe (y cresce para baixo)
    expect(todas[0]!.alpha).toBe(1);
    expect(todas[todas.length - 1]!.alpha).toBe(0);
    expect(m.durationMs).toBe(DAMAGE_FLOAT_MS);
  });
});

// ---------------------------------------------------------------------------
// Robustez e pureza
// ---------------------------------------------------------------------------

describe('robustez do relógio', () => {
  const todas = (): readonly Motion[] => [
    moveMotion(reta(3), INFANTARIA),
    impactMotion({ x: 0, y: -1 }, TILE, INFANTARIA),
    shakeMotion(TILE, INFANTARIA),
    deathMotion(TILE, INFANTARIA),
    damageNumberMotion(TILE),
  ];

  it('tempo negativo, `NaN` ou estourado nunca produz `NaN` na saída', () => {
    // O relógio vem do `Ticker` do Pixi, que acumula `deltaMS` — um quadro perdido, uma aba em
    // segundo plano, e o decorrido passa da duração. O módulo não pode devolver lixo por isso.
    for (const m of todas()) {
      for (const t of [-1000, -1, Number.NaN, Number.POSITIVE_INFINITY, m.durationMs * 10]) {
        const s = m.sampleAt(t);
        for (const [nome, valor] of Object.entries(s)) {
          if (nome === 'done') continue;
          expect(Number.isFinite(valor as number), `${nome} em t=${t}`).toBe(true);
        }
      }
    }
  });

  it('depois da duração, a amostra é o estado final e nada mais se mexe', () => {
    for (const m of todas()) {
      const fim = m.sampleAt(m.durationMs);
      expect(m.sampleAt(m.durationMs * 3)).toEqual(fim);
      expect(fim.done).toBe(true);
    }
  });

  it('é pura: a mesma entrada devolve a mesma saída', () => {
    // Sem relógio próprio, sem `Date`, sem `Math.random`. É o que permite a este arquivo
    // existir e o que torna a animação reproduzível quadro a quadro.
    for (const m of todas()) {
      for (const t of [0, 17, 55, m.durationMs / 3, m.durationMs]) {
        expect(m.sampleAt(t)).toEqual(m.sampleAt(t));
      }
    }
  });
});

describe('modo resultado instantâneo (§11)', () => {
  it('`instantly` colapsa qualquer animação no seu estado final', () => {
    // §11: "modo resultado instantâneo (pula animações) — essencial para farm". A exigência
    // vira propriedade do módulo puro, e não um `if` espalhado pelo componente: pular a
    // animação tem de dar exatamente o mesmo estado final que assisti-la até o fim.
    for (const original of [
      moveMotion(reta(5), WEIGHT_BY_UNIT_TYPE.armored),
      impactMotion({ x: -1, y: 0 }, TILE, INFANTARIA),
      deathMotion(TILE, INFANTARIA),
    ]) {
      const pulada = instantly(original);
      expect(pulada.durationMs).toBe(0);
      expect(pulada.sampleAt(0)).toEqual(original.sampleAt(original.durationMs));
      expect(pulada.sampleAt(0).done).toBe(true);
      expect(pulada.sampleAt(-5)).toEqual(pulada.sampleAt(9999));
    }
  });
});

// ---------------------------------------------------------------------------
// A coreografia do duelo
// ---------------------------------------------------------------------------

// Um `DuelResult` de mentira, montado à mão: o módulo só lê `trocas`, `finalHp*` e os ids, e
// depender do motor aqui trocaria um teste de coreografia por um teste de duelo.
function acao(actorId: string, targetId: string, damage: number, reaction?: number) {
  return {
    actorId,
    targetId,
    decision: 'basicAttack' as const,
    skillId: null,
    tacticsLineIndex: null,
    hit: damage > 0,
    isCrit: false,
    damage,
    heal: 0,
    reaction:
      reaction === undefined
        ? null
        : { skillId: 'skill-contra', lineIndex: 0, counterDamage: reaction, healDone: null, trigger: 'onAttacked' as const },
    effectsApplied: [],
  };
}

function duelo(overrides: Record<string, unknown> = {}) {
  return {
    attackerId: 'A',
    defenderId: 'D',
    trocas: [{ trocaNumber: 1 as const, firstMoverId: 'A', actions: [acao('A', 'D', 120)] }],
    winnerId: null,
    finalHpAttacker: 500,
    finalHpDefender: 380,
    ...overrides,
  };
}

describe('coreografia do duelo', () => {
  it('uma batida por ação que causou dano, na ordem cronológica', () => {
    const beats = duelBeats(
      duelo({
        trocas: [
          { trocaNumber: 1, firstMoverId: 'A', actions: [acao('A', 'D', 120), acao('D', 'A', 90)] },
          { trocaNumber: 2, firstMoverId: 'A', actions: [acao('A', 'D', 140)] },
        ],
      }) as never,
    );

    expect(beats.map((b) => `${b.actorId}->${b.targetId}:${b.damage}`)).toEqual([
      'A->D:120',
      'D->A:90',
      'A->D:140',
    ]);
    expect(beats.every((b) => b.kind === 'strike')).toBe(true);
  });

  it('ação que não acertou não vira batida', () => {
    // Sem isto o tabuleiro sacudiria a peça num golpe que a evasão de `spd` (§6.7) fez errar —
    // uma animação afirmando o contrário do que o core decidiu.
    const beats = duelBeats(
      duelo({ trocas: [{ trocaNumber: 1, firstMoverId: 'A', actions: [acao('A', 'D', 0)] }] }) as never,
    );
    expect(beats).toEqual([]);
  });

  it('a reação contra-ataca DEPOIS do golpe que a disparou, e no sentido inverso', () => {
    // §6.4 — a reação é do alvo contra quem bateu. Desenhá-la na mesma direção do golpe faria
    // o contra-ataque parecer parte do ataque.
    const beats = duelBeats(
      duelo({ trocas: [{ trocaNumber: 1, firstMoverId: 'A', actions: [acao('A', 'D', 120, 45)] }] }) as never,
    );
    expect(beats.map((b) => `${b.actorId}->${b.targetId}:${b.damage}`)).toEqual(['A->D:120', 'D->A:45']);
  });

  // M24 — as duas batidas que entraram para o ÁUDIO.
  it('o contra-ataque é `counter`, e não um golpe qualquer', () => {
    // Som diferente para evento diferente: quem ouve precisa distinguir "bati" de "apanhei
    // de volta". Visualmente ele continua sendo o mesmo impacto de antes.
    const beats = duelBeats(
      duelo({ trocas: [{ trocaNumber: 1, firstMoverId: 'A', actions: [acao('A', 'D', 120, 45)] }] }) as never,
    );

    expect(beats.map((b) => b.kind)).toEqual(['strike', 'counter']);
  });

  it('a cura vira batida sem virar animação', () => {
    // Curar não sacode ninguém — a batida existe para o som ter um instante ao qual se
    // pendurar. Sem ela, "curei 80" e "não aconteceu nada" soariam igual.
    const comCura = {
      ...acao('A', 'D', 0),
      heal: 80,
    };
    const beats = duelBeats(
      duelo({ trocas: [{ trocaNumber: 1, firstMoverId: 'A', actions: [comCura] }] }) as never,
    );

    expect(beats).toEqual([{ actorId: 'A', targetId: 'A', damage: 0, kind: 'heal' }]);
  });

  it('a cura de emergência da REAÇÃO também soa, e é do reagente', () => {
    // §6.4 — a reação com a tag `heal` cura quem reagiu em vez de contra-atacar.
    const comReacaoDeCura = {
      ...acao('A', 'D', 100),
      reaction: {
        skillId: 'skill-cura',
        lineIndex: 0,
        counterDamage: null,
        healDone: 60,
        trigger: 'onAttacked' as const,
      },
    };
    const beats = duelBeats(
      duelo({ trocas: [{ trocaNumber: 1, firstMoverId: 'A', actions: [comReacaoDeCura] }] }) as never,
    );

    expect(beats.map((b) => `${b.kind}:${b.actorId}`)).toEqual(['strike:A', 'heal:D']);
  });

  it('quem chega a zero de HP morre no fim, e só quem chega', () => {
    const beats = duelBeats(duelo({ finalHpDefender: 0 }) as never);
    expect(beats[beats.length - 1]).toEqual({ actorId: 'D', targetId: 'D', damage: 0, kind: 'death' });
    expect(beats.filter((b) => b.kind === 'death')).toHaveLength(1);

    // Duelo sem morte nenhuma não produz batida de morte.
    expect(duelBeats(duelo() as never).filter((b) => b.kind === 'death')).toEqual([]);
    // E os dois podem cair no mesmo duelo (§6.4 — gatilho de morte com contra-golpe letal).
    expect(
      duelBeats(duelo({ finalHpAttacker: 0, finalHpDefender: 0 }) as never).filter((b) => b.kind === 'death'),
    ).toHaveLength(2);
  });

  it('duelo sem troca nenhuma não produz coreografia', () => {
    expect(duelBeats(duelo({ trocas: [] }) as never)).toEqual([]);
  });
});

describe('M16 4/N — de onde o número de dano sai (`damageAnchorDirection`)', () => {
  const mapa = { width: 10, height: 10 };

  it('tile de cima livre: o número sai por cima, que é o espaço mais próximo da pancada', () => {
    expect(damageAnchorDirection({ x: 4, y: 4 }, new Set(), mapa)).toEqual({ x: 0, y: -1 });
  });

  it('tile de cima OCUPADO: o número desvia para uma diagonal em vez de cair sobre a peça', () => {
    // O caso real do capítulo 1: o bandido bate no herói que está logo abaixo dele, então o
    // tile acima do alvo é o tile do próprio bandido — e o número nascia sobre a plaqueta de
    // AP/PP e o glifo dele.
    const dir = damageAnchorDirection({ x: 4, y: 4 }, new Set(['4,3']), mapa);
    expect(dir).not.toEqual({ x: 0, y: -1 });
    expect(dir.y).toBe(-1);
    expect(Math.abs(dir.x)).toBe(1);
  });

  it('cima e a primeira diagonal ocupadas: cai na segunda diagonal', () => {
    expect(damageAnchorDirection({ x: 4, y: 4 }, new Set(['4,3', '3,3']), mapa)).toEqual({ x: 1, y: -1 });
  });

  it('nunca escolhe um tile fora do tabuleiro', () => {
    // Alvo na borda de cima: as três candidatas estão fora, e a saída declarada é a de cima.
    // Fora do tabuleiro o número não seria desenhado em lugar nenhum.
    expect(damageAnchorDirection({ x: 0, y: 0 }, new Set(), mapa)).toEqual({ x: 0, y: -1 });
    // Alvo no canto direito: a diagonal para fora é descartada e sobra a de dentro.
    expect(damageAnchorDirection({ x: 9, y: 4 }, new Set(['9,3']), mapa)).toEqual({ x: -1, y: -1 });
  });

  it('tudo ocupado: prefere o número sobreposto a um número fora do tabuleiro', () => {
    const cheio = new Set(['4,3', '3,3', '5,3']);
    expect(damageAnchorDirection({ x: 4, y: 4 }, cheio, mapa)).toEqual({ x: 0, y: -1 });
  });

  it('é pura: a mesma entrada dá a mesma saída e o conjunto de ocupados não é tocado', () => {
    const ocupados = new Set(['4,3']);
    const a = damageAnchorDirection({ x: 4, y: 4 }, ocupados, mapa);
    const b = damageAnchorDirection({ x: 4, y: 4 }, ocupados, mapa);
    expect(a).toEqual(b);
    expect([...ocupados]).toEqual(['4,3']);
  });
});
