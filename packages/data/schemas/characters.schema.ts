import { z } from 'zod';
import { idSchema } from './shared.js';

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
// A POSSE (quem o jogador de fato tem) também não mora aqui: D10 registrou que aquisição
// é estado de conta e milestone própria. O elenco é catálogo estático — o que existe no
// jogo, não o que uma conta destravou.
const characterSchema = z
  .object({
    id: idSchema,
    name: z.string().min(1),
    // A classe continua normativa e continua guiando status (D2). Que ela exista no
    // catálogo de classes é validação cruzada, e vive em `packages/content` — este
    // schema, como todos os outros de `packages/data`, valida um arquivo isolado.
    classId: idSchema,
  })
  .strict();

export default characterSchema;
