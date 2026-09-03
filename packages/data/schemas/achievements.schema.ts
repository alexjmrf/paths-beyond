import { z } from 'zod';
import { idSchema } from './shared.js';

// §10 (M18, 4/N) — ACHIEVEMENTS, uma das quatro fontes da moeda premium (D17/D20).
//
// **Decisão do usuário: a condição só olha estado que o servidor JÁ TEM.** Nada de
// contadores acumulados (batalhas vencidas, invocações feitas, dias ativos), que exigiriam
// uma tabela de contadores e um gancho em cada rota — e cada gancho é uma chance de o
// contador dessincronizar do que ele deveria contar, sem nada ficar vermelho.
//
// O jogador reivindica e o servidor CONFERE na hora, contra o banco. Isso também torna o
// achievement retroativo de graça: quem já cumpriu a condição antes de ela existir pode
// reivindicar assim que ela for autorada.
//
// `gold` NÃO é um `kind`, e a ausência é deliberada: o banco guarda o SALDO, não o
// acumulado, então "junte 10.000 de ouro" viraria uma conquista que some ao gastar.
const conditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chaptersCleared'), atLeast: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('dungeonsCleared'), atLeast: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('charactersOwned'), atLeast: z.number().int().positive() }).strict(),
  // "Algum herói com imprint/awakening pelo menos N" — não um herói nomeado: amarrar a
  // conquista a um personagem específico a tornaria impossível para quem não o puxou.
  z.object({ kind: z.literal('heroImprint'), atLeast: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('heroAwakening'), atLeast: z.number().int().positive() }).strict(),
  z.object({ kind: z.literal('elo'), atLeast: z.number().int().positive() }).strict(),
]);

const achievementSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    description: z.string().min(1),
    // Quanto de moeda premium a conquista paga. Inteiro e positivo: uma conquista que paga
    // zero é decoração, e o schema não deve deixar isso passar como se fosse fonte.
    premium: z.number().int().positive(),
    condition: conditionSchema,
  })
  .strict();

export default achievementSchema;
export { conditionSchema as achievementConditionSchema };
