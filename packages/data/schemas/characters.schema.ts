import { z } from 'zod';
import { gearSlotSchema, idSchema, tacticsLineSchema, weaponTypeSchema } from './shared.js';

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
    // O fragmento que a duplicata deste personagem paga, e que o `imprint` de §10 consome.
    // Obrigatório para os dois tipos: um personagem de história também tem imprint, e o
    // fragmento dele dropa na masmorra de Chefe desde M14.
    fragmentMaterialId: idSchema,
    // Obrigatória, e sem padrão: um personagem sem ficha é posse sem herói para levar ao
    // mapa — o jogador pagaria a moeda premium por uma linha no banco.
    startingHero: startingHeroSchema,
  })
  .strict();

export default characterSchema;
