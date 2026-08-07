import { z } from 'zod';
import heroSchema from './heroes.schema.js';
import { coordSchema, idSchema, mapAiArchetypeSchema } from './shared.js';

// M8 — `tools/balance` reusa o Modo 2/Coliseu (§9.2: "ataque e defesa rodam por IA
// declarativa... motor de balanceamento"), então TODA unidade de uma composição precisa
// de `aiArchetype` — não só o time defensor, como em PvP assíncrono (M7). `hero` é o
// schema de Hero (M1/M7) embutido inteiro, não uma referência por id: uma composição é
// autocontida (mesmo padrão de `duel-participants.schema.ts`, M2), sem depender de um
// catálogo externo de heróis por jogador que não existe pra este caso de uso.
const compUnitSchema = z.object({
  hero: heroSchema,
  pos: coordSchema,
  height: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  aiArchetype: mapAiArchetypeSchema,
});

// §9.1 — "o defensor monta um time de até 5 heróis" — mesmo teto aplicado aqui, já que
// uma composição de balanceamento representa um time jogável de verdade.
const compSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  units: z.array(compUnitSchema).min(1).max(5),
});

export default compSchema;
