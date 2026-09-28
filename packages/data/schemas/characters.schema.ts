import { z } from 'zod';
import { gearSlotSchema, idSchema, statKeySchema, tacticsLineSchema, valueRangeSchema, weaponTypeSchema } from './shared.js';

// M17 (§8.1) — o ELENCO. É a lista fechada de personagens jogáveis, e ela existe porque
// a árvore deixou de ser da classe: resolver a alocação de talentos de alguém exige a
// árvore DAQUELE personagem, o que só é possível com um elenco autorado (D6).
//
// O personagem é deliberadamente magro. Ele NÃO carrega nível, equipamento, awakening
// nem alocação — isso é estado de um `Hero` (a instância que o jogador leva ao mapa), e
// misturar as duas coisas foi o que fez o inimigo de fase virar uma ficha de personagem
// completa que ninguém joga (§8.1). O que o elenco declara é identidade e nada mais:
// quem é, como se chama, e de que classe ele puxa curva de stat, `moveType`, armas e
// pools (§8.2/D2).
//
// A ÁRVORE não mora aqui: `character-talent-trees/` é conteúdo próprio, indexado por
// `characterId`. São dois arquivos porque são dois tamanhos — o elenco tem três campos e
// a árvore tem dezenas de nós —, e porque §8.2 fixa a forma de `TalentTree` como
// `{ characterId, depth, nodes }` e o schema dela é `.strict()`: nome e classe não
// caberiam lá dentro sem contrariar a spec.
//
// A POSSE (quem o jogador de fato tem) também não mora aqui, e M18 não mudou isso: posse é
// estado de conta, no servidor. O elenco é catálogo estático — o que existe no jogo, não o
// que uma conta destravou. O que M18 acrescentou é a outra metade da pergunta, que É
// estática: COMO um personagem entra no jogo (D14).
// §10/D14 (M18, 6/N) — a FICHA INICIAL: com o que este personagem entra no jogo.
//
// Ela existe porque `POST /summon` concedia POSSE e mais nada — o personagem invocado não
// virava herói nenhum, e o mesmo buraco valia para o núcleo de quatro numa conta nova.
// Todo herói do projeto até esta fatia nasceu de seed de banco ou de fixture de teste.
//
// Mora no CATÁLOGO por causa da regra 4: nível, arma e skills iniciais são conteúdo, e
// derivá-los por convenção de id dentro de `apps/server` seria o "conteúdo hardcoded" que
// a regra proíbe. E é deliberadamente um subconjunto de `heroes.schema.ts`, não o `Hero`
// inteiro: o que ela NÃO carrega é PROGRESSO — exp, awakening, imprint e talentos são
// estado de conta, e um catálogo que os declarasse daria dois donos ao mesmo número.
const startingHeroSchema = z
  .object({
    // O nível com que a party existe no conteúdo autorado hoje. Não é um número novo: é o
    // mesmo com que os seis capítulos foram afinados (ver o teste em `packages/content`,
    // que trava a ficha contra a vaga da campanha).
    level: z.number().int().min(1).max(60),
    weaponType: weaponTypeSchema,
    // A arma é obrigatória — um herói desarmado não tem duelo a jogar (§6.1). Os outros
    // cinco slots são opcionais e nulos por padrão: gear é o que o jogador farma (§10).
    equipment: z.object({
      weapon: idSchema,
      helmet: idSchema.nullable(),
      armor: idSchema.nullable(),
      necklace: idSchema.nullable(),
      ring: idSchema.nullable(),
      boots: idSchema.nullable(),
    }) satisfies z.ZodType<Record<z.infer<typeof gearSlotSchema>, string | null>>,
    duelSkills: z.array(idSchema).min(1).max(5),
    mapSkills: z.array(idSchema).max(2),
    tacticsScript: z.array(tacticsLineSchema).max(6),
  })
  .strict();

const soulMainstatOptionSchema = z
  .object({
    stat: statKeySchema,
    weight: z.number().int().positive(),
    valueRange: valueRangeSchema,
  })
  .strict();

// "2 a 3 possibilidades" (roadmap M39), distintas — o mesmo limite de `SOUL_MAINSTAT_OPTIONS_*`
// no core, que falha alto se receber outra coisa.
const soulSchema = z
  .object({
    mainstatOptions: z
      .array(soulMainstatOptionSchema)
      .min(2)
      .max(3)
      .refine((opcoes) => new Set(opcoes.map((o) => o.stat)).size === opcoes.length, {
        message: 'as opções de mainstat da Soul não podem repetir stat.',
      }),
  })
  .strict();

const characterSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    // A classe continua normativa e continua guiando status (D2). Que ela exista no
    // catálogo de classes é validação cruzada, e vive em `packages/content` — este
    // schema, como todos os outros de `packages/data`, valida um arquivo isolado.
    classId: idSchema,
    // D14 (M18) — como o personagem entra no jogo. `story` é o NÚCLEO garantido a todo
    // jogador, e é contra ele que a campanha é afinada; `summon` é adquirível por banner.
    // Obrigatório e sem padrão de propósito: um personagem novo tem de declarar de que
    // lado está, senão ele nasce garantido por omissão e ninguém repara.
    acquisition: z.enum(['story', 'summon']),
    // M37 (§10, DECISIONS.md §1) — o RANK DE BASE. Identidade do personagem, como a classe:
    // um `Adventurer` é `Adventurer` para sempre, em toda conta.
    //
    // **`legend` não está aqui de propósito.** O topo não é invocável — chega-se nele por
    // evolução, e quem responde por isso é `rankCorrente(base, awakening)` em `packages/core`.
    // O rank CORRENTE não mora em arquivo nenhum: guardá-lo no catálogo repetiria o erro que o
    // M18 2/N pagou com o fragmento de imprint, o dado descrevendo estado de conta.
    //
    // Obrigatório e sem padrão, pelo mesmo motivo de `acquisition`: um campo com default é um
    // campo que ninguém preenche, e o rank decide de que banner o personagem sai e quanta curva
    // ele atravessa. O rank NÃO carrega poder — o que ele descreve é a profundidade da árvore
    // (`Adventurer` 5–6, `Hero` 7–9, mesmo orçamento de pontos; D9) e o custo de evolução.
    rank: z.enum(['adventurer', 'hero']),
    // O fragmento que a duplicata deste personagem paga, e que o `imprint` de §10 consome.
    // Obrigatório para os dois tipos: um personagem de história também tem imprint, e o
    // fragmento dele dropa na masmorra de Chefe desde M14.
    fragmentMaterialId: idSchema,
    // Obrigatória, e sem padrão: um personagem sem ficha é posse sem herói para levar ao
    // mapa — o jogador pagaria a moeda premium por uma linha no banco.
    startingHero: startingHeroSchema,
    // M39 3/N (D60) — a SOUL deste personagem: as 2 a 3 opções de mainstat, ligadas ao kit dele.
    // Mora aqui porque a trava é por PERSONAGEM: o dono é o próprio arquivo, e não há campo
    // `soulOf` para divergir dele (o `soulOf` da instância é derivado na carga). Obrigatória:
    // personagem sem Soul teria o 8º slot aberto e nada para craftar.
    soul: soulSchema,
  })
  .strict();

export default characterSchema;
