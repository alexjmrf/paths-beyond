import { describe, expect, it } from 'vitest';
import classSchema from '../schemas/classes.schema.js';
import compSchema from '../schemas/comps.schema.js';
import itemSchema from '../schemas/items.schema.js';
import itemSetSchema from '../schemas/item-sets.schema.js';
import skillSchema from '../schemas/skills.schema.js';
import {
  CLASS_PROFILES,
  ITEM_SETS,
  SHARED_ITEMS,
  generateBasicSkill,
  generateClass,
  generateComp,
  generatePromotedClass,
  generateSignatureSkill,
  generateStatCurve,
  generateTalentTree,
  generateWeaponItem,
  weaponItemId,
} from '../scripts/authorContent.js';

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

describe('generateTalentTree — conformidade com as regras de design de §8.2', () => {
  for (const profile of CLASS_PROFILES) {
    describe(profile.slug, () => {
      const tree = generateTalentTree(profile);

      it('tem 8 linhas representadas (row 1..8)', () => {
        const rows = new Set(tree.map((node) => node.row));
        expect(rows).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
      });

      it('tem exatamente 3 linhas de escolha (nós com exclusiveWith, mínimo exigido pela spec)', () => {
        const choiceRows = new Set(tree.filter((node) => (node.exclusiveWith?.length ?? 0) > 0).map((node) => node.row));
        expect(choiceRows.size).toBe(3);
      });

      it('tem pelo menos 2 nós tocando economia de AP/PP/assistência', () => {
        const econEffectTypes = new Set(['maxAp', 'maxPp', 'apRefund', 'duelApCap', 'assistRangeBonus']);
        const econNodes = tree.filter((node) => node.effects.some((effect) => econEffectTypes.has(effect.t)));
        expect(econNodes.length).toBeGreaterThanOrEqual(2);
      });

      it('preenchimento (+2% stat isolado) não passa de 30% dos nós', () => {
        const fillerNodes = tree.filter(
          (node) => node.effects.length === 1 && node.effects[0]!.t === 'stat' && (node.effects[0] as { pct?: number }).pct === 20 && !('flat' in node.effects[0]!),
        );
        expect(fillerNodes.length / tree.length).toBeLessThanOrEqual(0.3);
      });

      it('cada choice pair referencia o parceiro corretamente (exclusiveWith é mútuo)', () => {
        const byId = new Map(tree.map((node) => [node.id, node]));
        for (const node of tree) {
          for (const partnerId of node.exclusiveWith ?? []) {
            const partner = byId.get(partnerId);
            expect(partner).toBeDefined();
            expect(partner!.exclusiveWith).toContain(node.id);
          }
        }
      });
    });
  }
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

  it('os 2 item-sets são válidos', () => {
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

  it('a árvore de talentos é tree:"spec", não "class"', () => {
    for (const node of promoted.talentTree) {
      expect(node.tree).toBe('spec');
    }
  });

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
