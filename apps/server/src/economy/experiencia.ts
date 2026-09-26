import { aplicarExp, expDaInstancia } from '@paths-beyond/core';
import type { ContentCatalog, EncounterUnitContent } from '@paths-beyond/content';
import type { HeroRepository } from '../repository/types.js';

// M39 1/N — o EXP da vitória numa instância PvE (decisões do usuário, 2026-09-26): a soma dos
// inimigos dela, cada um pelo nível, dada a CADA herói do jogador que estava na partida. Vale
// para campanha e masmorra hoje, e para evento quando houver batalha de evento. A regra
// (`expDaInstancia`, `aplicarExp`) é do core; aqui só se busca quem e quanto.

export interface SubidaDeNivel {
  readonly heroId: string;
  readonly level: number;
  readonly niveisGanhos: number;
}

export interface ExpDaVitoria {
  readonly exp: number;
  readonly subidas: readonly SubidaDeNivel[];
}

/** Os inimigos de um encontro, com o nível de cada um vindo do catálogo. */
function inimigosDe(catalog: ContentCatalog, unidades: readonly EncounterUnitContent[]) {
  const inimigos: { level: number }[] = [];
  for (const unidade of unidades) {
    const enemyId = 'enemyId' in unidade ? unidade.enemyId : undefined;
    if (!enemyId) continue;
    inimigos.push({ level: catalog.enemies[enemyId]?.level ?? 0 });
  }
  return inimigos;
}

/** A instância que acabou de ser vencida: de quem, de que tipo, qual, e com quais heróis. */
export interface InstanciaVencida {
  readonly playerId: string;
  readonly kind: 'campaign' | 'dungeon' | 'arena';
  readonly refId: string;
  readonly heroIds: readonly string[];
}

export function unidadesDoEncontroDaPartida(
  catalog: ContentCatalog,
  instancia: Pick<InstanciaVencida, 'kind' | 'refId'>,
): readonly EncounterUnitContent[] {
  if (instancia.kind === 'campaign') return catalog.encounters.find((e) => e.id === instancia.refId)?.units ?? [];
  if (instancia.kind === 'dungeon') {
    const dungeon = catalog.dungeons[instancia.refId];
    return dungeon ? (catalog.dungeonEncounters[dungeon.encounterId]?.units ?? []) : [];
  }
  return [];
}

/** Aplica o exp da vitória a cada herói do jogador que estava na partida, e diz quem subiu. */
export async function darExpDaVitoria(
  catalog: ContentCatalog,
  heroRepository: HeroRepository,
  instancia: InstanciaVencida,
): Promise<ExpDaVitoria> {
  const regras = catalog.economyRules.experiencia;
  if (!regras) return { exp: 0, subidas: [] };

  const exp = expDaInstancia(inimigosDe(catalog, unidadesDoEncontroDaPartida(catalog, instancia)), regras.porNivelDeInimigo);
  if (exp <= 0) return { exp: 0, subidas: [] };

  const subidas: SubidaDeNivel[] = [];
  for (const stored of await heroRepository.getHeroesByIds(instancia.heroIds)) {
    if (stored.ownerPlayerId !== instancia.playerId) continue;
    const resultado = aplicarExp(stored.hero, exp, regras);
    await heroRepository.updateHero({ ...stored, hero: resultado.hero });
    if (resultado.niveisGanhos > 0) {
      subidas.push({ heroId: stored.hero.id, level: resultado.hero.level, niveisGanhos: resultado.niveisGanhos });
    }
  }
  return { exp, subidas };
}
