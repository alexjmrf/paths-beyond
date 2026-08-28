import { computeDamage, rollDamageVariance } from '../duel/damage.js';
import { applyActiveEffectsToStats, sumDamageTakenReductionPct, upsertActiveEffect } from '../duel/effects.js';
import { isTilePassable } from '../grid/pathfinding.js';
import { coordKey, tileAt, type Coord } from '../grid/types.js';
import { FP_SCALE } from '../math/fixed.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { Id } from '../types.js';
import { unitsInArea } from './area.js';
import { openGateCoords } from './gates.js';
import { insertIntoInitiativeOrder, rollInitiative, type InitiativeEntry } from './initiative.js';
import type { BattleState, BattleUnit } from './types.js';

// §5.6 (M11, sub-sessão 3/N) — "Recurso de exército, tipo Unicorn Overlord [...] Gasto em:
// restaurar AP/PP de uma unidade, invocar reforço, artilharia de mapa, buff global de 1
// round. Definidos em data/valor-skills/*.json." Cópia de tipo do core (regra 1: core não
// importa de packages/data), mesmo padrão de `SkillDef`/`EffectDef`.
//
// `payload` é tipado POR KIND — em M3 era um `Record<string, unknown>` solto, porque
// nenhum kind tinha resolução. Agora que três têm, um payload sem forma seria a mesma
// classe de bug que o schema de `defend` sem `target`: conteúdo válido que não faz nada.

interface ValorSkillBase {
  readonly id: Id;
  readonly name: string;
  readonly cost: number;
}

export type ValorSkillDef =
  | (ValorSkillBase & { readonly kind: 'restoreApPp'; readonly payload: { readonly ap: number; readonly pp: number } })
  | (ValorSkillBase & { readonly kind: 'artillery'; readonly payload: { readonly damage: number; readonly radius: number } })
  | (ValorSkillBase & { readonly kind: 'globalBuff'; readonly payload: { readonly effectId: Id } })
  // §5.6 (M15 D2) — o payload nomeia um blueprint de `BattleSetup.summonBlueprints`; a
  // unidade invocada é CONTEÚDO (regra 4), nunca gerada em código. Em M11 este kind
  // rejeitava alto por falta de resolução.
  | (ValorSkillBase & { readonly kind: 'summonReinforcement'; readonly payload: { readonly blueprintId: Id } });

export type ValorResolution =
  | {
      readonly ok: true;
      readonly units: readonly BattleUnit[];
      // §5.3 — só a invocação mexe na lista de iniciativa, e mesmo assim INSERINDO ("unidades
      // que entram depois são inseridas na posição correspondente ao seu valor de
      // iniciativa"). Ausente = lista inalterada, que é o caso dos outros três kinds.
      readonly initiativeOrder?: readonly InitiativeEntry[];
    }
  | { readonly ok: false; readonly reason: string };

// §5.6 — "buff global de 1 round": duração numérica de 1 round de mapa, que `endRound`
// (§5.3) já sabe tickar. Sem rolagem de chance: Valor é recurso pago e escasso, um efeito
// que pode simplesmente não acontecer seria surpresa, não decisão.
const GLOBAL_BUFF_DURATION = 1;

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

// Dano de artilharia: o `damage` do payload entra como `flat` de §6.6 com `multiplier` 0,
// então a mitigação por `def` (passos 2-4), a redução de dano do alvo (passo 8) e a
// variância (passo 9) continuam valendo. Sem triângulo de armas (Valor não empunha arma),
// sem crítico e sem posicional — não há lançador de quem herdar nada.
function artilleryDamage(state: BattleState, target: BattleUnit, damage: number): number {
  const targetStats = applyActiveEffectsToStats(target.stats, target.effects, state.effectDefs);
  return computeDamage({
    attackerAtk: 0,
    attackerDef: 0,
    attackerHp: 0,
    defenderDef: targetStats.def,
    skill: { multiplier: 0, flat: damage, scalesWith: 'atk' },
    attackerPen: 0,
    typeDamageMultiplier: FP_SCALE,
    positionalMultiplier: FP_SCALE,
    isCriticalHit: false,
    criticalDamageMultiplier: FP_SCALE,
    damageDealtPctSum: 0,
    damageTakenReductionPctSum: sumDamageTakenReductionPct(target.effects, state.effectDefs),
    // Stream por ALVO, sem lançador de quem herdar o `unitId`: dois inimigos idênticos no
    // mesmo bombardeio não podem dividir a mesma rolagem.
    varianceRoll: rollDamageVariance(
      nextUint32(rngFor(state.seed, state.round, target.unitId, 'valor-artillery-variance')).value,
    ),
  });
}

export function resolveValorSkill(state: BattleState, skill: ValorSkillDef, target: Coord): ValorResolution {
  switch (skill.kind) {
    case 'restoreApPp': {
      // O comando mira um tile (§01 §3.3 fixa a forma de `useValor`), então a unidade é a
      // que está nele. Só unidade viva do jogador: o Valor é o recurso do exército dele.
      const unit = state.units.find((u) => u.side === 'player' && u.hp > 0 && coordsEqual(u.pos, target));
      if (!unit) return { ok: false, reason: 'nenhuma unidade aliada viva no tile alvo' };
      return {
        ok: true,
        units: state.units.map((u) =>
          u.unitId === unit.unitId ? { ...u, ap: u.ap + skill.payload.ap, pp: u.pp + skill.payload.pp } : u,
        ),
      };
    }

    case 'artillery': {
      // Tile vazio não invalida o comando: o jogador escolheu o tile, e gastar Valor à toa
      // é decisão dele. Mesma leitura de `applyMapSkill`, que também conjura em área vazia.
      const hitIds = new Set(
        unitsInArea(state, target, skill.payload.radius)
          .filter((u) => u.side === 'enemy')
          .map((u) => u.unitId),
      );
      return {
        ok: true,
        units: state.units.map((u) =>
          hitIds.has(u.unitId) ? { ...u, hp: Math.max(0, u.hp - artilleryDamage(state, u, skill.payload.damage)) } : u,
        ),
      };
    }

    case 'globalBuff': {
      const def = state.effectDefs[skill.payload.effectId];
      if (!def) return { ok: false, reason: 'efeito do buff global não está no catálogo' };
      return {
        ok: true,
        units: state.units.map((u) =>
          u.side === 'player' && u.hp > 0
            ? {
                ...u,
                effects: upsertActiveEffect(u.effects, def, {
                  effectId: def.id,
                  target: 'self',
                  chance: FP_SCALE,
                  duration: GLOBAL_BUFF_DURATION,
                }),
              }
            : u,
        ),
      };
    }

    case 'summonReinforcement': {
      // Regra 4 — a unidade invocada é conteúdo. Sem blueprint no catálogo não há o que
      // invocar, e inventar um em código seria exatamente o que a regra proíbe.
      const blueprint = state.summonBlueprints?.[skill.payload.blueprintId];
      if (!blueprint) return { ok: false, reason: 'blueprint de reforço não está no catálogo' };

      const tile = tileAt(state.map, target);
      if (!tile) return { ok: false, reason: 'tile alvo fora do mapa' };
      if (!isTilePassable(state.map, target, blueprint.moveType, openGateCoords(state))) {
        return { ok: false, reason: 'o reforço não consegue ocupar o tile alvo' };
      }
      if (state.units.some((u) => u.hp > 0 && u.pos.x === target.x && u.pos.y === target.y)) {
        return { ok: false, reason: 'tile alvo ocupado' };
      }

      // Id próprio e determinístico: o do blueprint se repetiria a cada invocação, e duas
      // unidades com o mesmo `unitId` quebrariam iniciativa, duelo e replay de uma vez. Round
      // + tile são únicos por invocação — o tile fica ocupado logo depois.
      const unitId = `${skill.payload.blueprintId}@r${state.round}:${coordKey(target)}`;

      const summoned: BattleUnit = {
        ...blueprint,
        unitId,
        // §5.6 — Valor é o recurso do exército do jogador, então o reforço é dele.
        side: 'player',
        pos: target,
        // §5.5 — a vantagem de altura sai do terreno, nunca de número autorado à mão.
        height: tile.height,
        // Não age no round em que nasce: dar um turno extra imediato seria uma regra que
        // §5.6 não menciona, e o preço do Valor já é a decisão.
        hasActedThisRound: true,
      };

      return {
        ok: true,
        units: [...state.units, summoned],
        // §5.3 — a rolagem usa o round corrente (a lista inicial usa 0), então o stream da
        // invocada não colide com o de ninguém, e a mesma seed sempre a coloca no mesmo
        // lugar. As entradas já existentes não são recalculadas: a lista só recebe mais uma.
        initiativeOrder: insertIntoInitiativeOrder(state.initiativeOrder, {
          unitId,
          initiative: rollInitiative(state.seed, state.round, unitId, summoned.stats.spd),
        }),
      };
    }
  }
}
