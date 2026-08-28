import { z } from 'zod';
import heroSchema from './heroes.schema.js';
import { coordSchema, idSchema, mapAiArchetypeSchema } from './shared.js';
import { winConditionSchema } from './maps.schema.js';

// §10 (M14, sub-sessão 2/N) — o confronto de uma masmorra de farm.
//
// É o mesmo formato de `encounters/` (elenco de um mapa), com uma diferença que obriga a
// separar os dois tipos de conteúdo: **masmorra não tem capítulo**. Encounter de campanha
// é ordenado por `chapter`, e foi exatamente isso que a primeira tentativa desta fatia
// quebrou — escrever masmorra em `encounters/` fez a campanha do cliente passar de 6 para
// 14 capítulos e os testes de conteúdo acusarem na hora. Pastas separadas resolvem sem
// nenhum filtro implícito espalhado por quem lê o catálogo.
const dungeonEncounterUnitSchema = z.object({
  unitId: idSchema,
  side: z.enum(['player', 'enemy']),
  hero: heroSchema,
  pos: coordSchema,
  height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).default(0),
  aiArchetype: mapAiArchetypeSchema.optional(),
});

const dungeonEncounterSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    mapId: idSchema,
    // Farmar não pode custar herói: masmorra é sempre `casual`. Fica declarado (e não
    // implícito) porque §5.7 exige que permadeath seja flag do cenário, nunca hardcoded.
    permadeath: z.literal('casual'),
    winCondition: winConditionSchema.optional(),
    units: z.array(dungeonEncounterUnitSchema).min(1),
  })
  .refine((e) => e.units.some((u) => u.side === 'player'), {
    message: 'um encounter de masmorra precisa de pelo menos uma vaga do jogador.',
  })
  .refine((e) => e.units.some((u) => u.side === 'enemy'), {
    message: 'masmorra é uma batalha: precisa de pelo menos um inimigo.',
  })
  .refine((e) => new Set(e.units.map((u) => u.unitId)).size === e.units.length, {
    message: 'unitId precisa ser único dentro do encounter.',
  })
  .refine((e) => new Set(e.units.map((u) => `${u.pos.x},${u.pos.y}`)).size === e.units.length, {
    message: '1 herói = 1 tile: duas unidades não podem começar na mesma coordenada.',
  });

export default dungeonEncounterSchema;
