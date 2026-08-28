import { z } from 'zod';
import { gearSlotSchema, idSchema, raritySchema } from './shared.js';

// §10 — "Masmorras de farm com foco definido: Equipamento (drop por set), Experiência,
// Ouro, Chefe (materiais de promoção). Energia de conta limita o farm diário."
//
// Os quatro focos são os quatro da spec, enum fechado. Tudo aqui é número de
// balanceamento: quanto cai, de qual set e em que faixa — o motor
// (`packages/core/src/economy/drops.ts`) só sabe rolar peso e faixa.

const valueRangeSchema = z
  .object({ min: z.number().int().min(0), max: z.number().int().min(0) })
  .refine((r) => r.max >= r.min, { message: 'max precisa ser >= min.' });

const gearDropSchema = z.object({
  weight: z.number().int().positive(),
  setId: idSchema,
  slot: gearSlotSchema,
  rarity: raritySchema,
  // Mesma faixa de `ItemInstance.ilvl` (§7.2): a masmorra não pode dropar item fora do
  // que o resto do jogo considera item.
  ilvl: z.number().int().min(58).max(100),
});

const materialDropSchema = z.object({
  weight: z.number().int().positive(),
  materialId: idSchema,
  amount: valueRangeSchema,
});

// Decisão do usuário (M14 2/N): "reseta a entrada em dias X da semana ou do mês dependendo
// do conteúdo". `hourUtc` porque sem referência "dia" não tem definição — o reset é em UTC.
const resetScheduleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('weekdays'),
    days: z.array(z.number().int().min(0).max(6)),
    hourUtc: z.number().int().min(0).max(23).optional(),
  }),
  z.object({
    kind: z.literal('monthDays'),
    days: z.array(z.number().int().min(1).max(31)),
    hourUtc: z.number().int().min(0).max(23).optional(),
  }),
]);

const dungeonSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    focus: z.enum(['gear', 'exp', 'gold', 'boss']),
    // Decisão do usuário: a masmorra é uma BATALHA. `normal` precisa ser limpa à mão uma
    // vez e depois aceita time automático; `elite` dá mais recursos, é sempre manual e tem
    // entrada travada por tempo.
    difficulty: z.enum(['normal', 'elite']),
    // O confronto: o mesmo `Encounter` que a campanha usa desde M12.
    encounterId: idSchema,
    manualOnly: z.boolean().optional(),
    requiresClearOf: idSchema.optional(),
    entryLimit: z
      .object({ maxEntries: z.number().int().positive(), resetOn: resetScheduleSchema })
      .optional(),
    energyCost: z.number().int().positive(),
    gold: valueRangeSchema.optional(),
    exp: valueRangeSchema.optional(),
    stones: valueRangeSchema.optional(),
    gearDropCount: z.number().int().positive().optional(),
    gearDrops: z.array(gearDropSchema).nonempty().optional(),
    materialDropCount: z.number().int().positive().optional(),
    materialDrops: z.array(materialDropSchema).nonempty().optional(),
  })
  // Contagem sem tabela roda a rolagem contra o vazio (nada cai, em silêncio); tabela sem
  // contagem é conteúdo que nunca é lido. Os dois são erro de autoria, não configuração.
  .refine((d) => Boolean(d.gearDropCount) === Boolean(d.gearDrops), {
    message: 'gearDropCount e gearDrops precisam existir juntos.',
  })
  .refine((d) => Boolean(d.materialDropCount) === Boolean(d.materialDrops), {
    message: 'materialDropCount e materialDrops precisam existir juntos.',
  })
  // Uma masmorra não pode exigir a limpeza de si mesma: seria inalcançável para sempre.
  .refine((d) => d.requiresClearOf !== d.id, { message: 'requiresClearOf não pode apontar para a própria masmorra.' });

export default dungeonSchema;
