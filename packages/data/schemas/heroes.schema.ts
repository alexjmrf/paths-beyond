import { z } from 'zod';
import { gearSlotSchema, idSchema, tacticsLineSchema, weaponTypeSchema } from './shared.js';

const awakeningSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

const imprintSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

// TalentAllocation não tem shape normativo na spec. Decisão registrada em DECISIONS.md:
// Record<TalentNodeId, rank> — ausência de uma chave equivale a rank 0.
const talentAllocationSchema = z.record(idSchema, z.number().int().min(0));

const equipmentSchema = z.object({
  weapon: idSchema.nullable(),
  helmet: idSchema.nullable(),
  armor: idSchema.nullable(),
  necklace: idSchema.nullable(),
  ring: idSchema.nullable(),
  boots: idSchema.nullable(),
}) satisfies z.ZodType<Record<z.infer<typeof gearSlotSchema>, string | null>>;

// §4.2 — Hero. `tacticsScript` era placeholder `unknown` em M1 (decisão registrada em
// DECISIONS.md); M2 leu docs/spec/04-duelo.md §6.3 e tipa de verdade agora.
// `weaponType` é novo em M7 (sub-sessão 4): ClassDef.allowedWeapons é uma lista (uma
// classe pode usar vários tipos de arma), mas o duelo precisa de UM weaponType por
// herói — decisão registrada em DECISIONS.md, tomada com o usuário, de que o herói
// escolhe explicitamente dentre `classDef.allowedWeapons` (não validado por este
// schema — validação cruzada com a classe é responsabilidade de quem resolve o herói).
const heroSchema = z.object({
  id: idSchema,
  // §8.1 (M17) — QUAL PERSONAGEM do elenco este herói é. A árvore de talentos deixou de
  // pertencer à classe, então `talents` só tem sentido contra a árvore daquele personagem,
  // e só o elenco fechado (D6) diz qual é.
  //
  // Opcional até a 3/N: inimigo de fase ainda é autorado como `Hero` completo, e inimigo
  // não é personagem (§8.1). Quem não declara `characterId` não tem árvore e resolve com
  // zero talentos — que é o que os inimigos de hoje já fazem, com `talents: {}`.
  characterId: idSchema.optional(),
  classId: idSchema,
  level: z.number().int().min(1).max(60),
  exp: z.number().int().min(0),
  awakening: awakeningSchema,
  imprint: imprintSchema,
  talents: talentAllocationSchema,
  equipment: equipmentSchema,
  weaponType: weaponTypeSchema,
  duelSkills: z.array(idSchema).max(5),
  mapSkills: z.array(idSchema).max(2),
  tacticsScript: z.array(tacticsLineSchema).max(6),
});

export default heroSchema;
