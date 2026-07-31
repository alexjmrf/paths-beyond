import { z } from 'zod';

/**
 * Schema de infraestrutura genérico — não é conteúdo de jogo.
 * Existe só para provar que o pipeline validate.ts + Zod funciona (ver .claude/rules/dados.md).
 */
const sampleSchema = z.object({
  id: z.string(),
  value: z.number().int(),
});

export default sampleSchema;
