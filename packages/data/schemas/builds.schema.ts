import { z } from 'zod';
import { idSchema } from './shared.js';

// §09-roadmap.md (M5) — "builds compartilháveis". Sem formato de compartilhamento
// especial (código compactado/URL) — decisão registrada em DECISIONS.md: só um registro
// serializável de uma TalentAllocation nomeada para uma classe.
const talentAllocationSchema = z.record(idSchema, z.number().int().min(0));

const buildSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  classId: idSchema,
  talents: talentAllocationSchema,
});

export default buildSchema;
