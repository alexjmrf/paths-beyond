import { describe, expect, it } from 'vitest';
import classSchema from '../schemas/classes.schema.js';
import compSchema from '../schemas/comps.schema.js';
import itemSchema from '../schemas/items.schema.js';
import itemSetSchema from '../schemas/item-sets.schema.js';
import skillSchema from '../schemas/skills.schema.js';
import {
  BASELINE_REACTIONS,
  CLASS_PROFILES,
  ITEM_SETS,
  SHARED_ITEMS,
  SIGNATURE_EFFECTS,
  SKILL_ASSISTIR,
  SKILL_CURA_CLERIGO,
  SKILL_REVIDE_PRECISO,
  SKILL_ULTIMO_SUSPIRO,
  SPECIAL_ITEM_SETS,
  generateBasicSkill,
  generateClass,
  generateComp,
  generatePromotedClass,
  generateSignatureSkill,
  generateStatCurve,
  generateWeaponItem,
  weaponItemId,
} from '../scripts/authorContent.js';
// §8.1 (M17, 2/N) — a árvore saiu da CLASSE e virou do PERSONAGEM, e o gerador dela foi
// junto. O que este arquivo ainda tem a dizer sobre talento é a costura comp↔árvore: a
// alocação que uma comp escreve tem de existir na árvore de quem a joga. A conformidade
// das nove árvores com §8.2 é medida sobre os arquivos AUTORADOS, não sobre o gerador, em
// `packages/content/tests/elenco.test.ts`.
import { characterForClass, columnGrantingAssist, generateTalentTree } from '../scripts/authorCharacters.js';

const espadachim = CLASS_PROFILES.find((p) => p.slug === 'espadachim')!;

describe('generateStatCurve', () => {
  it('gera exatamente 60 níveis', () => {
    expect(generateStatCurve(espadachim)).toHaveLength(60);
  });

  it('nível 1 bate com os valores base do perfil (mesmo padrão de class-soldado.json, M1)', () => {
    const curve = generateStatCurve(espadachim);
    expect(curve[0]).toEqual({ hp: 420, atk: 63, def: 42, spd: 80 });
  });

  it('nível 60 bate com a extrapolação linear (hp/atk/def) e o degrau de spd a cada 5 níveis', () => {
    const curve = generateStatCurve(espadachim);
    expect(curve[59]).toEqual({ hp: 1600, atk: 240, def: 160, spd: 92 });
  });

  it('spd sobe em degraus de 5 níveis, não em reta contínua', () => {
    const curve = generateStatCurve(espadachim);
    expect(curve[3]?.spd).toBe(80); // nível 4
    expect(curve[4]?.spd).toBe(81); // nível 5
    expect(curve[8]?.spd).toBe(81); // nível 9
    expect(curve[9]?.spd).toBe(82); // nível 10
  });

  it('é determinística', () => {
    expect(generateStatCurve(espadachim)).toEqual(generateStatCurve(espadachim));
  });
});

describe('conteúdo gerado valida contra os schemas Zod reais', () => {
  for (const profile of CLASS_PROFILES) {
    it(`class-${profile.slug} / skills / comp-${profile.slug} são válidos`, () => {
      expect(() => classSchema.parse(generateClass(profile))).not.toThrow();
      expect(() => skillSchema.parse(generateBasicSkill(profile))).not.toThrow();
      expect(() => skillSchema.parse(generateSignatureSkill(profile))).not.toThrow();
      expect(() => compSchema.parse(generateComp(profile))).not.toThrow();
    });
  }
});

describe('itens e sets (M8, sub-sessão 3/N)', () => {
  it('cada arma gerada é um ItemInstance válido', () => {
    for (const profile of CLASS_PROFILES) {
      expect(() => itemSchema.parse(generateWeaponItem(profile))).not.toThrow();
    }
  });

  it('os 2 itens compartilhados (colares) são ItemInstance válidos', () => {
    for (const item of SHARED_ITEMS) {
      expect(() => itemSchema.parse(item)).not.toThrow();
    }
  });

  it('todos os item-sets são válidos', () => {
    for (const set of ITEM_SETS) {
      expect(() => itemSetSchema.parse(set)).not.toThrow();
    }
  });

  it('todo comp equipa a arma da própria classe e um colar do mesmo set (2 peças, dispara o bônus de 2pc)', () => {
    for (const profile of CLASS_PROFILES) {
      const comp = generateComp(profile);
      const hero = comp.units[0]!.hero;
      expect(hero.equipment.weapon).toBe(weaponItemId(profile));
      expect(hero.equipment.necklace).not.toBeNull();

      const weapon = generateWeaponItem(profile);
      const necklace = SHARED_ITEMS.find((item) => item.id === hero.equipment.necklace);
      expect(necklace).toBeDefined();
      expect(necklace!.setId).toBe(weapon.setId);
    }
  });

  it('classes physical e magic equipam sets diferentes', () => {
    const setIds = new Set(CLASS_PROFILES.map((p) => generateWeaponItem(p).setId));
    expect(setIds).toEqual(new Set(['set-forca', 'set-guardiao']));
  });
});

// M10, sub-sessão 4/N — o critério de aceite 3 de M10 exige `pnpm balance` rodando com
// comps MULTI-UNIDADE e assistência real. Antes desta fatia todo comp tinha 1 unidade, e
// nenhuma skill do catálogo tinha trigger `onAllyEngagedNearby` — `resolveAssists` (M2)
// devolvia `[]` sempre, então o dano de assistência da sub-sessão 2 nunca disparava em
// conteúdo real.
describe('comps multi-unidade com assistência real (M10, sub-sessão 4/N)', () => {
  it('skill-assistir é uma reação onAllyEngagedNearby de 1 PP, e NÃO é baseline', () => {
    expect(() => skillSchema.parse(SKILL_ASSISTIR)).not.toThrow();
    expect(SKILL_ASSISTIR.kind).toBe('reaction');
    expect(SKILL_ASSISTIR.trigger).toBe('onAllyEngagedNearby');
    expect(SKILL_ASSISTIR.ppCost).toBe(1); // §6.5.3 — "assistir gasta 1 PP do assistente"
    expect(skillSchema.parse(SKILL_ASSISTIR).baseline).toBe(false);
  });

  it('as duas reações universais de §6.4 continuam marcadas baseline', () => {
    for (const reaction of BASELINE_REACTIONS) {
      expect(skillSchema.parse(reaction).baseline).toBe(true);
    }
    expect(BASELINE_REACTIONS.map((r) => r.id).sort()).toEqual(['skill-contra-atacar', 'skill-defender']);
  });

  it('todo comp gerado tem mais de uma unidade', () => {
    for (const profile of CLASS_PROFILES) {
      expect(generateComp(profile).units.length).toBeGreaterThan(1);
    }
  });

  it('cada unidade do comp tem um heroId único (unitId vem daí em runTournament)', () => {
    for (const profile of CLASS_PROFILES) {
      const ids = generateComp(profile).units.map((u) => u.hero.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('cada unidade ocupa um tile próprio — 1 herói = 1 tile', () => {
    for (const profile of CLASS_PROFILES) {
      const coords = generateComp(profile).units.map((u) => `${u.pos.x},${u.pos.y}`);
      expect(new Set(coords).size).toBe(coords.length);
    }
  });

  it('toda unidade aloca um nó que concede skill-assistir — sem isso nenhuma assistiria', () => {
    // A árvore é a do PERSONAGEM da unidade (§8.1), não a da classe do comp: as três
    // unidades são personagens distintos desde a 2/N, e cada uma desce a própria coluna.
    // Vale a asserção pelo EFEITO e não pelo id do nó — o nome da slug é sabor de autoria,
    // "a alocação abre a janela de assistência" é a propriedade.
    for (const profile of CLASS_PROFILES) {
      for (const unit of generateComp(profile).units) {
        const arvore = generateTalentTree(characterForClass(unit.hero.classId));
        const alocados = arvore.nodes.filter((node) => (unit.hero.talents[node.id] ?? 0) > 0);
        const concedem = alocados.filter((node) =>
          node.effects.some((e) => e.t === 'grantReaction' && e.reactionId === SKILL_ASSISTIR.id),
        );
        expect(concedem.length, unit.hero.id).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('toda alocação de comp existe na árvore do personagem que a joga', () => {
    // O recíproco do teste acima, e o que ele sozinho não pegaria: `resolveTalentEffects`
    // ignora nó desconhecido em silêncio (§8.2), então uma slug errada numa comp não
    // quebraria nada — só apagaria o talento e a matriz de winrate mediria outra build.
    for (const profile of CLASS_PROFILES) {
      for (const unit of generateComp(profile).units) {
        const ids = new Set(generateTalentTree(characterForClass(unit.hero.classId)).nodes.map((n) => n.id));
        for (const alocado of Object.keys(unit.hero.talents)) {
          expect(ids.has(alocado), `${unit.hero.id} → ${alocado}`).toBe(true);
        }
      }
    }
  });

  it('a coluna escolhida pela comp é a que concede assistir, dos dois lados', () => {
    // `columnGrantingAssist` é a decisão que `generateComp` toma; aqui ela é conferida
    // contra a árvore gerada, e não contra si mesma.
    for (const personagem of CLASS_PROFILES.map((p) => characterForClass(`class-${p.slug}`))) {
      const coluna = columnGrantingAssist(personagem);
      const arvore = generateTalentTree(personagem);
      const concedem = arvore.nodes.filter((node) =>
        node.effects.some((e) => e.t === 'grantReaction' && e.reactionId === SKILL_ASSISTIR.id),
      );
      expect(concedem.length, personagem.id).toBeGreaterThanOrEqual(1);
      expect(concedem.map((n) => n.column), personagem.id).toContain(coluna);
    }
  });

  // §6.5.2 — o aliado precisa estar "dentro do assistRange da sua arma em relação ao
  // duelo". assistRange de melee é 2 (MELEE_ASSIST_RANGE, M7); manter todos os aliados
  // dentro de 2 de distância Manhattan entre si garante que a janela de assistência
  // possa abrir independente de qual unidade do comp for engajada.
  it('todo par de unidades do comp fica a no máximo 2 tiles de distância Manhattan', () => {
    for (const profile of CLASS_PROFILES) {
      const units = generateComp(profile).units;
      for (const a of units) {
        for (const b of units) {
          const distance = Math.abs(a.pos.x - b.pos.x) + Math.abs(a.pos.y - b.pos.y);
          expect(distance).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});

describe('geração é determinística e pura', () => {
  it('gerar a mesma classe duas vezes produz JSON idêntico', () => {
    expect(JSON.stringify(generateClass(espadachim))).toBe(JSON.stringify(generateClass(espadachim)));
  });

  it('gerar o mesmo comp duas vezes produz JSON idêntico', () => {
    expect(JSON.stringify(generateComp(espadachim))).toBe(JSON.stringify(generateComp(espadachim)));
  });
});

describe('flying/armored (M8, sub-sessão 4/N)', () => {
  it('Grifeiro é unitType flying, Couraçado é unitType armored', () => {
    const grifeiro = CLASS_PROFILES.find((p) => p.slug === 'grifeiro')!;
    const couracado = CLASS_PROFILES.find((p) => p.slug === 'couracado')!;
    expect(grifeiro.unitType).toBe('flying');
    expect(couracado.unitType).toBe('armored');
  });

  it('hp de Grifeiro e Couraçado, e atk de Grifeiro, seguem o mesmo piso igualado do resto do roster', () => {
    const grifeiro = CLASS_PROFILES.find((p) => p.slug === 'grifeiro')!;
    const couracado = CLASS_PROFILES.find((p) => p.slug === 'couracado')!;
    expect(grifeiro.hpBase).toBe(espadachim.hpBase);
    expect(grifeiro.atkBase).toBe(espadachim.atkBase);
    expect(couracado.hpBase).toBe(espadachim.hpBase);
  });

  it('atk de Couraçado fica abaixo do piso do roster — compensação intencional pela passiva de armored (-20% dano físico, §6.8)', () => {
    const couracado = CLASS_PROFILES.find((p) => p.slug === 'couracado')!;
    expect(couracado.atkBase).toBeLessThan(espadachim.atkBase);
  });
});

describe('classe promovida (M8, sub-sessão 4/N)', () => {
  const promoted = generatePromotedClass();

  it('é um ClassDef válido, tier spec, com promotesFrom/promotionRequirement', () => {
    expect(() => classSchema.parse(promoted)).not.toThrow();
    expect(promoted.tier).toBe('spec');
    expect(promoted.promotesFrom).toBe('class-espadachim');
    expect(promoted.promotionRequirement).toEqual({ minLevel: 20, itemId: 'item-brasao-mestre-espadachim' });
  });

  // §8.1 (M17, 2/N) — o teste da árvore `tree:"spec"` da promoção SAIU, e não foi
  // substituído: com a árvore pertencendo ao personagem, a classe promovida não tem árvore
  // nenhuma para ter forma. `mestre-espadachim` é a promoção do espadachim e chega por
  // `hero-jogador` (D7), que já tem a árvore dele. O que a promoção ainda promete —
  // requisito, tier e ganho real de stat — continua medido pelos testes vizinhos.

  it('tem stats mais fortes que class-espadachim no mesmo nível (promoção é ganho real de poder)', () => {
    const promotedCurve = promoted.statCurve;
    const baseCurve = generateClass(espadachim).statCurve;
    expect(promotedCurve[9]!.hp!).toBeGreaterThan(baseCurve[9]!.hp!);
    expect(promotedCurve[9]!.atk!).toBeGreaterThan(baseCurve[9]!.atk!);
  });

  it('nenhum comp gerado referencia a classe promovida — fica fora do torneio de tools/balance de propósito', () => {
    for (const profile of CLASS_PROFILES) {
      const comp = generateComp(profile);
      for (const unit of comp.units) {
        expect(unit.hero.classId).not.toBe(promoted.id);
      }
    }
  });
});

describe('sets `special` de §7.4 (M10, sub-sessão 6/N)', () => {
  const byId = new Map(SPECIAL_ITEM_SETS.map((set) => [set.id, set]));

  it('os 4 sets da tabela de §7.4 que mudam comportamento existem', () => {
    expect([...byId.keys()].sort()).toEqual(['set-duelista', 'set-imunidade', 'set-reserva', 'set-sentinela']);
  });

  it('cada um é um ItemSet válido, com um único efeito `special` de 4 peças', () => {
    for (const set of SPECIAL_ITEM_SETS) {
      expect(() => itemSetSchema.parse(set)).not.toThrow();
      expect(set.effects).toHaveLength(1);
      expect(set.effects[0]!.t).toBe('special');
      expect(set.effects[0]!.pieces).toBe(4);
    }
  });

  // Os effectId NÃO são conteúdo livre: são os ids canônicos que o motor reconhece,
  // declarados em packages/core/src/items/sets.ts. packages/data não depende de
  // @paths-beyond/core, então as strings estão espelhadas — este teste é o que impede as
  // duas cópias de divergirem em silêncio (uma divergência deixaria o set inerte).
  it('os effectId batem exatamente com os ids canônicos do motor', () => {
    expect(byId.get('set-duelista')!.effects[0]!.effectId).toBe('set-special:duelista-contra-atacar-livre-troca-1');
    expect(byId.get('set-reserva')!.effects[0]!.effectId).toBe('set-special:reserva-ap');
    expect(byId.get('set-sentinela')!.effects[0]!.effectId).toBe('set-special:sentinela-assistencia-livre-por-round');
    expect(byId.get('set-imunidade')!.effects[0]!.effectId).toBe('set-special:imunidade-debuff-troca-1');
  });

  it('entram no catálogo geral de item-sets', () => {
    for (const set of SPECIAL_ITEM_SETS) {
      expect(ITEM_SETS).toContain(set);
    }
  });

  // Corte de escopo consciente desta fatia (ver DECISIONS.md): os sets existem como
  // conteúdo válido, mas ninguém os equipa — é o que mantém `pnpm balance` numericamente
  // idêntico à sub-sessão 4. Equipá-los é um ciclo de rebalanceamento próprio.
  it('nenhum item gerado pertence a um set special, e nenhum comp os equipa', () => {
    const specialIds = new Set(byId.keys());
    for (const item of SHARED_ITEMS) {
      expect(specialIds.has(item.setId)).toBe(false);
    }
    for (const profile of CLASS_PROFILES) {
      expect(specialIds.has(generateWeaponItem(profile).setId)).toBe(false);
    }
  });
});

// M10, sub-sessão 8/N — `SkillDef.lethalUses` (frequência do gatilho de morte, §6.4).
// Escopo declarado no dado, não no motor: o core tem um default ('perDuel'), mas omitir o
// campo mudaria silenciosamente o poder da skill inteira, então o schema exige.
describe('gatilho de morte — schema de `lethalUses`', () => {
  const lethalSkill = {
    id: 'skill-fixture-onlethal',
    name: 'Fixture',
    kind: 'duel' as const,
    apCost: 0,
    cooldown: 0,
    multiplier: 0,
    flat: 0,
    scalesWith: 'atk' as const,
    effects: [],
    trigger: 'onLethal' as const,
    tags: ['survive'],
  };

  it('aceita `perDuel` e `perBattle` com trigger onLethal', () => {
    expect(skillSchema.parse({ ...lethalSkill, lethalUses: 'perDuel' }).lethalUses).toBe('perDuel');
    expect(skillSchema.parse({ ...lethalSkill, lethalUses: 'perBattle' }).lethalUses).toBe('perBattle');
  });

  it('rejeita trigger onLethal sem `lethalUses`', () => {
    expect(() => skillSchema.parse(lethalSkill)).toThrow();
  });

  it('rejeita `lethalUses` em skill que não é gatilho de morte', () => {
    expect(() => skillSchema.parse({ ...lethalSkill, trigger: undefined, lethalUses: 'perDuel' })).toThrow();
  });

  // Gap consciente desta fatia, mesmo padrão dos sets `special` acima: o motor entende o
  // gatilho, mas autorar skill que o use é escopo declarado de M12 ("skills que usam os
  // efeitos de M10"). É o que mantém `pnpm balance` e o GOLDEN_HASH intactos.
  it('nenhuma skill do catálogo real declara trigger onLethal ainda', () => {
    // As skills geradas nem sequer têm o campo `trigger` no tipo — a leitura frouxa é
    // proposital: o que importa é o valor final, venha ele do gerador ou do JSON.
    const triggerOf = (skill: object): unknown => (skill as { trigger?: unknown }).trigger;
    for (const profile of CLASS_PROFILES) {
      expect(triggerOf(generateBasicSkill(profile))).not.toBe('onLethal');
      expect(triggerOf(generateSignatureSkill(profile))).not.toBe('onLethal');
    }
    for (const reaction of BASELINE_REACTIONS) {
      expect(reaction.trigger).not.toBe('onLethal');
    }
    expect(SKILL_ASSISTIR.trigger).not.toBe('onLethal');
  });
});

// M11, sub-sessão 2/N — `SkillDef.areaRadius` (§5.4, "cura em área, artilharia, buff de
// zona"). Ao contrário de `lethalUses`, é opcional: skill de mapa de alvo único é
// legítima e a ausência é o caso conservador (raio 0 = só o tile alvo).
describe('skill de mapa em área — schema de `areaRadius`', () => {
  const mapSkill = {
    id: 'skill-fixture-artilharia',
    name: 'Fixture',
    kind: 'map' as const,
    apCost: 1,
    cooldown: 0,
    multiplier: 1200,
    flat: 0,
    scalesWith: 'atk' as const,
    duelRange: 4,
    effects: [],
    tags: ['physical'],
  };

  it('aceita raio em skill de mapa, e a ausência dele', () => {
    expect(skillSchema.parse({ ...mapSkill, areaRadius: 2 }).areaRadius).toBe(2);
    expect(skillSchema.parse(mapSkill).areaRadius).toBeUndefined();
  });

  it('aceita raio 0 — alvo único é uma skill de mapa legítima', () => {
    expect(skillSchema.parse({ ...mapSkill, areaRadius: 0 }).areaRadius).toBe(0);
  });

  it('rejeita raio negativo', () => {
    expect(() => skillSchema.parse({ ...mapSkill, areaRadius: -1 })).toThrow();
  });

  it('rejeita raio em skill que não é de mapa — seria número inerte', () => {
    expect(() => skillSchema.parse({ ...mapSkill, kind: 'duel', areaRadius: 2 })).toThrow();
  });

  // Gap consciente, mesmo padrão dos efeitos de M10: autorar a skill de área e dá-la a uma
  // classe é escopo de M12 (§10, campanha com objetivos variados), e mexeria no balanceamento.
  it('nenhuma skill do catálogo real declara `areaRadius` ainda', () => {
    const areaRadiusOf = (skill: object): unknown => (skill as { areaRadius?: unknown }).areaRadius;
    for (const profile of CLASS_PROFILES) {
      expect(areaRadiusOf(generateBasicSkill(profile))).toBeUndefined();
      expect(areaRadiusOf(generateSignatureSkill(profile))).toBeUndefined();
    }
  });
});

// M12, sub-sessão 2/N — o critério de aceite raiz de M12 ("nenhuma skill do catálogo é só
// um número de dano") vira teste executável em vez de afirmação em prosa. A EXCEÇÃO é
// declarada e decidida com o usuário: o ataque básico e as duas reações universais de §6.4
// são o fallback que toda unidade tem de graça (§6.2: "o ataque básico custa 0 AP e está
// sempre disponível"), e dar efeito a eles inflaria a linha de base em vez de criar
// escolha. O critério vale para toda skill que o jogador ESCOLHE.
describe('nenhuma skill escolhível é só um número de dano (critério de aceite de M12)', () => {
  const BASELINE_IDS = new Set(['skill-contra-atacar', 'skill-defender']);
  const isBasicAttack = (id: string): boolean => id.startsWith('skill-ataque-');

  // `skill-assistir` é a terceira exceção, e por um motivo MECÂNICO, não de design: uma
  // assistência é ou 50% do dano da skill, ou cura em efeito integral (§6.5.3) — e mais
  // nada. `applyAssistDamage` (M10 sub-sessão 2) IGNORA `skill.effects` de propósito, corte
  // documentado desde M10 sub-sessão 1. Dar um efeito a ela seria autorar conteúdo morto,
  // que é pior do que assumir que é um número. Para uma assistência ser "mais que um
  // número" sem mentir, o motor teria que aplicar efeitos de assistência — mudança de core,
  // não de conteúdo. Registrado em DECISIONS.md como limitação conhecida.
  const ASSIST_ID = 'skill-assistir';

  function isMoreThanDamage(skill: Record<string, unknown>): boolean {
    const effects = (skill.effects ?? []) as unknown[];
    const tags = (skill.tags ?? []) as string[];
    return (
      effects.length > 0 || // aplica buff/debuff/DoT
      tags.includes('heal') || // cura (M10 sub-sessão 7/N)
      skill.trigger === 'onLethal' || // gatilho de morte (M10 sub-sessão 8/N)
      (skill.multiplier === 0 && skill.flat === 0) // não causa dano nenhum (Defender)
    );
  }

  const allSkills = [
    ...CLASS_PROFILES.map(generateSignatureSkill),
    SKILL_ASSISTIR,
    SKILL_CURA_CLERIGO,
    SKILL_ULTIMO_SUSPIRO,
    SKILL_REVIDE_PRECISO,
  ] as unknown as Record<string, unknown>[];

  it('toda especial de classe aplica um efeito', () => {
    for (const profile of CLASS_PROFILES) {
      const signature = generateSignatureSkill(profile);
      expect(signature.effects.length).toBeGreaterThan(0);
      expect(signature.effects[0]!.duration).toBe('duel');
    }
  });

  it('nenhuma skill escolhível do catálogo é só dano', () => {
    for (const skill of allSkills) {
      const id = skill.id as string;
      if (isBasicAttack(id) || BASELINE_IDS.has(id) || id === ASSIST_ID) continue;
      expect(isMoreThanDamage(skill), `${id} é só um número de dano`).toBe(true);
    }
  });

  // Trava a razão da exceção: se um dia o motor passar a aplicar efeitos de assistência,
  // este teste falha e a exceção precisa ser reavaliada em vez de virar folclore.
  it('a assistência continua sem poder expressar mais que um número (limitação do motor)', () => {
    expect((SKILL_ASSISTIR as { effects?: unknown[] }).effects ?? []).toEqual([]);
    expect(SKILL_ASSISTIR.tags).not.toContain('heal');
  });

  it('a exceção declarada continua sendo só o básico e as 2 reações universais de §6.4', () => {
    for (const profile of CLASS_PROFILES) {
      expect(generateBasicSkill(profile).id).toMatch(/^skill-ataque-/);
    }
    expect(BASELINE_REACTIONS.map((r) => r.id).sort()).toEqual([...BASELINE_IDS].sort());
  });

  it('todo effectId aplicado por uma especial existe entre os EffectDef autorados', () => {
    const known = new Set([...SIGNATURE_EFFECTS.map((e) => e.id), 'effect-fragilidade']);
    for (const profile of CLASS_PROFILES) {
      for (const application of generateSignatureSkill(profile).effects) {
        expect(known.has(application.effectId)).toBe(true);
      }
    }
  });
});

// As três mecânicas de M10 que passaram M10 inteira sem UM consumidor real (gap registrado
// quatro sub-sessões seguidas). Estes testes são o que impede a regressão silenciosa: sem
// eles, remover a skill deixaria o motor de novo com uma mecânica que ninguém usa.
describe('as mecânicas de M10 ganham consumidor real (M12, sub-sessão 2/N)', () => {
  it('a tag `heal` tem uma skill de conteúdo real', () => {
    expect(SKILL_CURA_CLERIGO.tags).toContain('heal');
    expect(() => skillSchema.parse(SKILL_CURA_CLERIGO)).not.toThrow();
  });

  it('`onLethal` tem uma passiva real, com escopo declarado', () => {
    expect(SKILL_ULTIMO_SUSPIRO.trigger).toBe('onLethal');
    expect(SKILL_ULTIMO_SUSPIRO.lethalUses).toBe('perBattle');
    expect(SKILL_ULTIMO_SUSPIRO.tags).toContain('survive');
    expect(() => skillSchema.parse(SKILL_ULTIMO_SUSPIRO)).not.toThrow();
  });

  // O motivo de `ppCost: 0` está no comentário da própria skill: com 1 PP ela nunca
  // dispararia, porque Contra-atacar (onAttacked, baseline, sem condições) vence sempre e
  // `tryLateReaction` sai cedo se já houve reação na troca. Este teste trava o 0.
  it('`onDamaged` tem uma reação real: cura, custando 0 PP — senão nunca dispararia', () => {
    expect(SKILL_REVIDE_PRECISO.trigger).toBe('onDamaged');
    expect(SKILL_REVIDE_PRECISO.ppCost).toBe(0);
    // §6.4 "Cura de emergência": curar é a única forma de uma reação ser mais que um
    // número de dano, porque `resolveDuel` ignora os `skill.effects` de reação.
    expect(SKILL_REVIDE_PRECISO.tags).toContain('heal');
    expect(() => skillSchema.parse(SKILL_REVIDE_PRECISO)).not.toThrow();
  });

  it('as três chegam a uma unidade de verdade: duelSkills, talento e script', () => {
    const clerigo = CLASS_PROFILES.find((p) => p.slug === 'clerigo')!;
    const couracado = CLASS_PROFILES.find((p) => p.slug === 'couracado')!;
    const arqueiro = CLASS_PROFILES.find((p) => p.slug === 'arqueiro')!;

    // Cura: em duelSkills E numa linha de script com condição (decisão, não troca fixa).
    const compClerigo = generateComp(clerigo);
    expect(compClerigo.units[0]!.hero.duelSkills).toContain(SKILL_CURA_CLERIGO.id);
    expect(compClerigo.units[0]!.hero.tacticsScript[0]!.skillId).toBe(SKILL_CURA_CLERIGO.id);
    expect(compClerigo.units[0]!.hero.tacticsScript[0]!.conditions.length).toBeGreaterThan(0);

    // onLethal: passiva em duelSkills (é assim que chega a `knownSkills`), sem linha de script.
    const compCouracado = generateComp(couracado);
    expect(compCouracado.units[0]!.hero.duelSkills).toContain(SKILL_ULTIMO_SUSPIRO.id);
    expect(compCouracado.units[0]!.hero.tacticsScript.map((l) => l.skillId)).not.toContain(SKILL_ULTIMO_SUSPIRO.id);

    // onDamaged: concedida por talento, e o comp PRECISA alocar o talento — sem isso o
    // gatilho continuaria sem consumidor no torneio.
    const compArqueiro = generateComp(arqueiro);
    const sylla = characterForClass('class-arqueiro');
    const concede = generateTalentTree(sylla).nodes.filter((n) =>
      n.effects.some((e) => e.t === 'grantReaction' && e.reactionId === SKILL_REVIDE_PRECISO.id),
    );
    expect(concede.length).toBeGreaterThanOrEqual(1);
    // A âncora do comp é o próprio personagem da classe (`compRoster` põe o perfil do comp
    // primeiro), e ela precisa DESCER pelo nó — a reação só existe se o ponto for gasto.
    const alocacao = compArqueiro.units[0]!.hero.talents;
    expect(concede.some((n) => (alocacao[n.id] ?? 0) > 0), 'nenhum nó de fôlego alocado').toBe(true);
  });

  it('só o Arqueiro tem reação própria — §6.4 fecha as universais em duas', () => {
    const comReacao = CLASS_PROFILES.filter((p) => p.grantedReactionId !== undefined);
    expect(comReacao.map((p) => p.slug)).toEqual(['arqueiro']);
  });
});

// Passe do HANDOFF, 2026-08-28 — as comps mistas.
//
// A medição do torneio com `weaponDuelRanges` real (bow/arcane/nature/holy = 2) mostrou ranged
// vencendo melee em **20 de 20 pareamentos**, com 4 comps acima de 65% e 5 abaixo de 40%. A causa
// não era fórmula: as 9 comps eram MONOCLASSE, e três arqueiros contra três espadachins é
// exatamente o tabuleiro em que "fechar distância" — a resposta tática que §6.1 nomeia — não
// existe. Uma comp mista de experimento ficou em 50,3%, a única na faixa de 40–60%.
//
// A forma escolhida com o usuário: **temática por classe, com apoio**. Cada comp mantém o nome e
// duas unidades da própria classe (a matriz continua legível por classe: "Arqueiro vence
// Lanceiro" segue significando algo sobre arqueiros) e ganha uma terceira que cobre o que falta.
describe('comps mistas: cada composição tem resposta em corpo a corpo E em alcance', () => {
  const MELEE = new Set(['sword', 'axe', 'spear']);
  // Três unidades por comp desde M10 4/N; nomeado aqui para a contagem abaixo dizer o que mede.
  const COMP_UNIT_COUNT = 3;

  it('toda comp tem ao menos uma arma de alcance e ao menos uma de corpo a corpo', () => {
    // É a propriedade que faz a assimetria de §6.1 ser JOGÁVEL no torneio em vez de decidida na
    // seleção: quem apanha de longe tem com quem fechar distância, e quem é alcançado tem com
    // quem revidar de longe.
    for (const profile of CLASS_PROFILES) {
      const armas = generateComp(profile).units.map((u) => u.hero.weaponType);
      expect(armas.some((w) => MELEE.has(w)), `${profile.slug}: nenhuma arma corpo a corpo`).toBe(true);
      expect(armas.some((w) => !MELEE.has(w)), `${profile.slug}: nenhuma arma de alcance`).toBe(true);
    }
  });

  // §8.1 (M17, 2/N) — a leitura por classe MUDOU DE FORMA, e a mudança é consequência de D6.
  // Até aqui a comp tinha duas unidades da própria classe, e a maioria era o que segurava a
  // leitura da matriz. Com o elenco fechado e um personagem por classe, duas unidades da
  // classe do comp seriam a MESMA PESSOA duas vezes — o herói sintético que D6 aposentou.
  // A leitura passa a ser segurada pela ÂNCORA: a primeira unidade é o personagem daquela
  // classe, e é dela que o comp tira o nome. "Arqueiro vence Lanceiro" segue significando
  // algo sobre arqueiros; o que deixa de significar é "sobre três arqueiros".
  it('a âncora do comp é o personagem da classe que dá nome a ele', () => {
    for (const profile of CLASS_PROFILES) {
      const ancora = generateComp(profile).units[0]!;
      expect(ancora.hero.classId, profile.slug).toBe(`class-${profile.slug}`);
      expect(ancora.hero.characterId, profile.slug).toBe(characterForClass(`class-${profile.slug}`).id);
    }
  });

  it('as três unidades são personagens DISTINTOS — elenco fechado não empilha cópias', () => {
    // O modo de falha que isto pega é o que D6 aposentou voltando pela porta do apoio: se
    // `compRoster` escolhesse um apoio já presente, a comp teria a mesma pessoa duas vezes,
    // com a mesma árvore e a mesma build, e a matriz mediria um clone.
    for (const profile of CLASS_PROFILES) {
      const personagens = generateComp(profile).units.map((u) => u.hero.characterId);
      expect(new Set(personagens).size, profile.slug).toBe(personagens.length);
    }
  });

  it('nenhum heroId se repete ENTRE comps — duas comps num mesmo torneio compartilham o tabuleiro', () => {
    // Modo de falha que só nasce com comps mistas: o arqueiro de apoio do comp-espadachim
    // colidindo com um herói do comp-arqueiro. `runTournament` usa `hero.id` como `unitId`, e
    // dois `unitId` iguais na mesma batalha são a mesma unidade para o motor.
    const todos = CLASS_PROFILES.flatMap((p) => generateComp(p).units.map((u) => u.hero.id));
    const repetidos = todos.filter((id, i) => todos.indexOf(id) !== i);
    expect([...new Set(repetidos)]).toEqual([]);
  });

  it('a unidade de apoio é de uma classe que existe no catálogo', () => {
    const conhecidas = new Set(CLASS_PROFILES.map((p) => `class-${p.slug}`));
    for (const profile of CLASS_PROFILES) {
      for (const unit of generateComp(profile).units) {
        expect(conhecidas.has(unit.hero.classId), `${profile.slug}: ${unit.hero.classId}`).toBe(true);
      }
    }
  });

  it('toda comp é MISTA — tem corpo a corpo e tem alcance', () => {
    // A regra antiga ("classe de alcance ganha apoio corpo a corpo, e vice-versa") saiu na 5/N
    // porque produzia o mesmo par de apoio nas nove comps. O que ela PROTEGIA continua sendo
    // exigido aqui, e é a propriedade, não o mecanismo: sem as duas coisas no time, o torneio
    // volta ao tabuleiro em que "fechar distância" não existe e ranged vence melee em 20 de 20.
    //
    // É por isto que `COMP_ROSTER_ORDER` é intercalada e não a ordem de declaração de
    // CLASS_PROFILES: aquela daria uma comp inteiramente de espada/machado/lança e outra
    // inteiramente de casters.
    for (const profile of CLASS_PROFILES) {
      const armas = generateComp(profile).units.map((u) => u.hero.weaponType);
      expect(armas.some((w) => MELEE.has(w)), `${profile.slug}: sem corpo a corpo`).toBe(true);
      expect(armas.some((w) => !MELEE.has(w)), `${profile.slug}: sem alcance`).toBe(true);
    }
  });

  it('as nove comps são times DISTINTOS entre si', () => {
    // O teste que faltava, e o defeito que ele teria pego: até a 5/N, `comp-arqueiro`,
    // `comp-couracado` e `comp-espadachim` eram os MESMOS três personagens, diferindo só na
    // ordem das posições — e pontuavam 67,1%, 57,2% e 63,4% em `pnpm balance`, ou seja, dez
    // pontos percentuais de diferença medindo posição inicial e chamando aquilo de composição.
    //
    // Um terço da matriz media a mesma coisa três vezes, e nada reclamava: as asserções
    // existentes olhavam UMA comp por vez (âncora certa, três personagens distintos DENTRO da
    // comp), e nenhuma comparava as comps ENTRE si.
    const times = CLASS_PROFILES.map((p) => ({
      id: `comp-${p.slug}`,
      chave: [...generateComp(p).units.map((u) => u.hero.characterId)].sort().join('+'),
    }));
    const porChave = new Map<string, string[]>();
    for (const t of times) porChave.set(t.chave, [...(porChave.get(t.chave) ?? []), t.id]);
    const duplicados = [...porChave.values()].filter((ids) => ids.length > 1);
    expect(duplicados, 'comps com o mesmo elenco').toEqual([]);
  });

  it('cada personagem do elenco aparece no mesmo número de comps', () => {
    // Consequência de "âncora + os dois seguintes, circulando", e a razão de ela ter sido
    // escolhida: com a regra antiga, arqueiro e couraçado estavam em NOVE comps e o resto em
    // uma ou duas. Um personagem super-representado desloca a matriz inteira na direção dele, e
    // a leitura "o comp X está forte" passa a poder significar "o apoio de todo mundo está forte".
    const contagem = new Map<string, number>();
    for (const profile of CLASS_PROFILES) {
      for (const unit of generateComp(profile).units) {
        contagem.set(unit.hero.characterId, (contagem.get(unit.hero.characterId) ?? 0) + 1);
      }
    }
    expect(contagem.size).toBe(CLASS_PROFILES.length);
    expect([...new Set(contagem.values())]).toEqual([COMP_UNIT_COUNT]);
  });
});
