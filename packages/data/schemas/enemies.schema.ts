import { z } from 'zod';
import {
  fullStatSheetSchema,
  idSchema,
  moveTypeSchema,
  tacticsLineSchema,
  unitTypeSchema,
  weaponTypeSchema,
} from './shared.js';

// §8.1 (M17, sub-sessão 3/N) — o INIMIGO DE FASE, autorado direto.
//
// "Inimigo de campanha, de masmorra e qualquer unidade que só exista para ser enfrentada é
// autorado direto: status e skills escolhidos para a dificuldade pretendida, sem classe a
// resolver, sem nível a interpolar, sem árvore e sem alocação de talento."
//
// Compare com `heroes.schema.ts`, que é o que este arquivo substitui do lado inimigo: lá
// há `classId`, `level`, `exp`, `awakening`, `imprint`, `talents` e `equipment`, sete
// campos que existem porque um herói PROGRIDE. Um inimigo não progride — ele é escrito
// pronto —, e cada um desses campos era uma tabela a mais entre o que o autor quis dizer
// ("este inimigo tem esta força") e o número que o jogo usava.
//
// `.strict()` de propósito, e não por gosto de rigor: sem ele um inimigo migrado pela
// metade — ainda carregando `classId: 'class-arqueiro', level: 8` — validaria, os campos
// seriam ignorados na resolução, e o encontro entraria em jogo com a força do que restou.
// Falhar alto é o que transforma uma migração incompleta em erro de validação.
const enemySchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    // A folha COMPLETA. Diferente da `statCurve` da classe, que é parcial porque a
    // agregação (§4.1) preenche o resto: aqui não há agregação nenhuma depois, então um
    // campo ausente viraria zero em silêncio, e `def: 0` é diferença grande de dificuldade.
    stats: fullStatSheetSchema,
    unitType: unitTypeSchema,
    // A arma decide `duelRange` e `assistRange` (§6.1) na resolução, no core. O inimigo
    // declara QUAL arma ele usa, nunca o alcance dela — poder declarar o alcance seria
    // poder furar a assimetria que a spec chama de identidade tática do alcance.
    weaponType: weaponTypeSchema,
    moveType: moveTypeSchema,
    moveRange: z.number().int().positive(),
    // O que em `Hero` era `classDef.basePools` mais bônus de talento mais efeito de set.
    pools: z.object({ ap: z.number().int().nonnegative(), pp: z.number().int().nonnegative() }).strict(),
    // Mesmos tetos de `heroes.schema.ts`, e a razão é que eles não são do herói: são do
    // duelo e do script tático (§6.3). Um script de 9 linhas é ilegível independentemente
    // de quem o carrega, e a previsibilidade é o produto (regra 6).
    duelSkills: z.array(idSchema).max(5),
    mapSkills: z.array(idSchema).max(2),
    tacticsScript: z.array(tacticsLineSchema).max(6),
  })
  .strict();

export default enemySchema;
