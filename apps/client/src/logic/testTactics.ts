import {
  selectTacticsAction,
  type BattleUnit,
  type TacticsDecision,
  type TacticsScript,
  type UnitType,
  type WeaponType,
} from '@paths-beyond/core';

// §11 — "Editor de táticas: ... botão 'Testar' contra um manequim configurável (HP,
// tipo, arma, PP)." Reusa `selectTacticsAction` do core (M2) direto — nenhuma mudança em
// packages/core foi necessária pra esta fatia, mesmo padrão do preview de duelo.
export interface DummyConfig {
  readonly hpPct: number; // 0..100 (convertido pra fp-scale 0..1000 ao montar o contexto)
  readonly pp: number;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly isSelfAttacker: boolean;
  readonly hasPositionalBonus: boolean;
  readonly trocaNumber: 1 | 2 | 3;
}

export const DEFAULT_DUMMY: DummyConfig = {
  hpPct: 50,
  pp: 1,
  unitType: 'infantry',
  weaponType: 'sword',
  isSelfAttacker: true,
  hasPositionalBonus: false,
  trocaNumber: 1,
};

export function runTacticsTest(
  unit: BattleUnit,
  script: TacticsScript,
  dummy: DummyConfig,
): TacticsDecision {
  const selfHpPct = unit.stats.hp > 0 ? Math.trunc((unit.hp / unit.stats.hp) * 1000) : 0;

  return selectTacticsAction({
    script,
    skills: unit.knownSkills,
    cooldowns: unit.cooldowns,
    apSpentThisDuel: 0,
    context: {
      self: {
        currentHpPct: selfHpPct,
        ap: unit.ap,
        pp: unit.pp,
        unitType: unit.unitType,
        weaponType: unit.weaponType,
        activeBuffIds: [],
        activeDebuffIds: [],
      },
      target: {
        currentHpPct: Math.trunc(dummy.hpPct * 10),
        ap: 0,
        pp: dummy.pp,
        unitType: dummy.unitType,
        weaponType: dummy.weaponType,
        activeBuffIds: [],
        activeDebuffIds: [],
      },
      isSelfAttacker: dummy.isSelfAttacker,
      hasPositionalBonus: dummy.hasPositionalBonus,
      trocaNumber: dummy.trocaNumber,
      battleRound: 1,
      alliesAdjacentCount: 0,
    },
  });
}
