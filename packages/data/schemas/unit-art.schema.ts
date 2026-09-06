import { z } from 'zod';
import { idSchema } from './shared.js';

// M26 — a declaração de arte de uma unidade.
//
// **D22 reabriu formalmente o critério 1 do M16** ("nenhum arquivo de imagem entra no
// repositório"). Ele não foi apagado: virou este contrato. Imagem passa a entrar, e o preço é
// que cada uma diga de onde veio.
//
// A entrada tem duas formas e nenhuma terceira. `sprite` é uma imagem no repositório, com
// procedência; `glyph` é a peça desenhada por código do M16, que continua sendo a
// representação de quem ainda não tem arte. **A segunda forma existe justamente para não ser
// um default**: se "sem sprite" fosse só a ausência de um arquivo, o repositório não saberia
// distinguir uma escolha de um esquecimento, e cinquenta unidades entram nesse projeto uma por
// vez.
//
// Por que o manifesto é CONTEÚDO e não um índice do cliente: regra 4. Quem gera a imagem é um
// script, quem a desenha é o cliente, e quem responde "esta unidade tem arte?" tem de ser um
// dado versionado que o `pnpm validate:data` valida junto com todo o resto — senão a resposta
// mora em código do cliente e some da vista de quem autora conteúdo.

// O diretório é fixo de propósito. `apps/client/src/art/units/` é varrido pelo
// `semAssetsRaster.test.ts` do cliente, que é a outra metade do contrato ("imagem só onde é
// declarada"); um caminho livre aqui permitiria um PNG legítimo fora do alcance daquela
// varredura, e os dois testes passariam enquanto a regra estaria furada.
export const DIRETORIO_DE_ARTE = 'apps/client/src/art/units';

// §4 do aceite do M26: "existe manifesto com procedência, prompt, seed e licença de cada
// imagem". Os quatro são obrigatórios, e `seed` é o que separa manifesto de decoração: sem
// ela a imagem não é regerável, e "de onde veio isto" volta a ser uma pergunta sem resposta.
const procedenciaSchema = z
  .object({
    ferramenta: z.literal('pixellab'),
    endpoint: z.string().min(1),
    modelo: z.string().min(1),
    // O prompt LITERAL que produziu a imagem, não um resumo. É metade do par que a regenera.
    prompt: z.string().min(1),
    seed: z.number().int().nonnegative(),
    // O id do personagem do lado da PixelLab. É por ele que uma animação ou uma variação
    // futura se prende a ESTA imagem em vez de gerar outro personagem parecido — que é
    // exatamente o defeito de consistência que D22 escolheu evitar por construção.
    characterId: z.string().min(1),
    licenca: z.string().min(1),
    geradoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const spriteSchema = z
  .object({
    unitId: idSchema,
    kind: z.literal('sprite'),
    // A peça do TABULEIRO: a rotação `south`, encarando o jogador.
    arquivo: z.string().startsWith(`${DIRETORIO_DE_ARTE}/`).endsWith('.png'),
    // M26 2/N — as peças da TELA DE DUELO, de três quartos, uma olhando para cada lado.
    //
    // Elas não custam geração nenhuma: `create-character-v3` produz as 8 rotações de uma vez e
    // até aqui o gerador baixava só uma. As outras sete estavam paradas do lado da PixelLab,
    // presas ao mesmo `characterId` que este manifesto já guardava.
    //
    // Obrigatórias, e não opcionais: quem tem sprite tem as três, porque o gerador baixa as
    // três na mesma passada. Deixar opcional criaria um estado — "tem peça de tabuleiro, não
    // tem de duelo" — que nenhum caminho produz e que a tela teria de tratar para sempre.
    duelo: z
      .object({
        // Olhando para a direita: é a peça de quem está do lado ESQUERDO da cena.
        sudeste: z.string().startsWith(`${DIRETORIO_DE_ARTE}/`).endsWith('.png'),
        // Olhando para a esquerda: o lado DIREITO da cena.
        sudoeste: z.string().startsWith(`${DIRETORIO_DE_ARTE}/`).endsWith('.png'),
      })
      .strict(),
    // O lado do quadro em pixels. Fica no dado, e não numa constante do cliente, porque a
    // resolução é a pergunta que o M26 1/N mede — e porque unidades podem acabar em
    // resoluções diferentes sem que isso vire um `if` no renderer.
    frameSize: z.number().int().positive(),
    procedencia: procedenciaSchema,
  })
  .strict();

const glifoSchema = z
  .object({
    unitId: idSchema,
    kind: z.literal('glyph'),
    // Obrigatório. É o que transforma "não tem arte" de silêncio em declaração.
    motivo: z.string().min(11),
  })
  .strict();

const unitArtSchema = z.discriminatedUnion('kind', [spriteSchema, glifoSchema]);

export type UnitArt = z.infer<typeof unitArtSchema>;

export default unitArtSchema;
