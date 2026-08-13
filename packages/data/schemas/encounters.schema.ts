import { z } from 'zod';
import heroSchema from './heroes.schema.js';
import { coordSchema, idSchema, mapAiArchetypeSchema } from './shared.js';
import { winConditionSchema } from './maps.schema.js';

// §10 (M12, sub-sessão 1/N) — "Campanha em capítulos: 6-10 mapas". Um `encounter` é o
// ELENCO de um mapa jogado: quem entra, onde, de que lado. O LAYOUT (tiles, terreno)
// continua em `maps/*.json` e é referenciado por `mapId` — separar os dois deixa um mesmo
// layout servir a capítulos diferentes sem duplicar a matriz de tiles (os mapas atuais têm
// ~940 linhas só de `tiles`).
//
// Até M11 este conteúdo vivia em `apps/client/src/data/campaign.ts` como TypeScript: o
// último canto de conteúdo hardcoded do projeto, e o que impedia servidor e `sim-cli` de
// rodarem um mapa de campanha. Mesma correção que M9 fez para o resto do conteúdo.

// `hero` embutido inteiro em vez de referência por id, e `aiArchetype` por unidade —
// precedente direto de `comps.schema.ts` (M8), que resolveu o mesmo problema para o
// torneio. O `aiArchetype` é opcional aqui e obrigatório lá: numa campanha a unidade do
// jogador é controlada por humano (ausente = humano, mesma leitura de `BattleUnit`).
const encounterUnitSchema = z.object({
  unitId: idSchema,
  side: z.enum(['player', 'enemy']),
  hero: heroSchema,
  pos: coordSchema,
  height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
  aiArchetype: mapAiArchetypeSchema.optional(),
});

const encounterSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    mapId: idSchema,
    // §10 — "campanha em capítulos". Ordena a campanha sem depender da ordem em que os
    // arquivos são lidos do disco (que `findJsonFiles` não garante entre plataformas).
    chapter: z.number().int().positive(),
    // §5.7 — "Permadeath é flag do BattleSetup (casual | classic | ironman), nunca
    // hardcoded". Estava hardcoded em `campaign.ts` como 'casual' desde M6; é conteúdo do
    // cenário, então mora aqui.
    permadeath: z.enum(['casual', 'classic', 'ironman']),
    // Opcional, sobrepondo o do layout quando presente. É o que permite um mapa de
    // `escort`: a condição referencia `unitId`, que só existe no elenco — declarar isso no
    // layout amarraria o layout a um roster específico (ver DECISIONS.md).
    winCondition: winConditionSchema.optional(),
    units: z.array(encounterUnitSchema).min(1),
  })
  .refine((encounter) => encounter.units.some((unit) => unit.side === 'player'), {
    message: 'um encounter precisa de pelo menos uma unidade do jogador.',
  })
  .refine(
    (encounter) => new Set(encounter.units.map((unit) => unit.unitId)).size === encounter.units.length,
    { message: 'unitId precisa ser único dentro do encounter.' },
  )
  .refine(
    (encounter) =>
      new Set(encounter.units.map((unit) => `${unit.pos.x},${unit.pos.y}`)).size === encounter.units.length,
    { message: '1 herói = 1 tile: duas unidades não podem começar na mesma coordenada.' },
  )
  .refine(
    (encounter) => {
      // A condição `escort` nomeia uma unidade; ela precisa existir no elenco, senão a
      // partida nasce sem desfecho possível (o motor resolve isso como derrota imediata).
      const condition = encounter.winCondition;
      if (condition?.t !== 'escort') return true;
      return encounter.units.some((unit) => unit.unitId === condition.unitId && unit.side === 'player');
    },
    { message: 'a condição `escort` precisa nomear uma unidade do jogador presente no encounter.' },
  );

export default encounterSchema;
