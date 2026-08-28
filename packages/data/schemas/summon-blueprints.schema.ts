import { z } from 'zod';
import heroSchema from './heroes.schema.js';
import { idSchema } from './shared.js';

// §5.6 (M15 D2) — "Gasto em: [...] invocar reforço". Quem é o reforço é CONTEÚDO (regra 4 do
// CLAUDE.md), nunca gerado em código: o motor recebe o perfil de combate já resolvido em
// `BattleSetup.summonBlueprints` e só decide onde a unidade nasce, com que id e de que lado.
//
// `hero` embutido inteiro, e não uma referência por id, pelo mesmo motivo de
// `encounters.schema.ts` e `comps.schema.ts`: o reforço é uma unidade específica de um
// cenário (nível, arma, script tático), não um herói do roster do jogador.
//
// O que este schema NÃO declara, de propósito: `pos`, `height`, `side` e `unitId`. Os quatro
// só existem no instante da invocação — o tile é o alvo do comando `useValor`, a altura vem
// do tile, o lado é sempre o do jogador (§5.6: Valor é o recurso do exército dele) e o id é
// derivado pelo motor para não repetir a cada invocação.
const summonBlueprintSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  hero: heroSchema,
});

export default summonBlueprintSchema;
