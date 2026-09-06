import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIRETORIO_DE_ARTE, type UnitArt } from '@paths-beyond/data/schemas/unit-art.schema.js';
import type { ClientePixelLab, Direcao } from './pixellab.js';
import { descricaoDe, type EspecificacaoDeArte } from './prompt.js';

// M26 — a geração de UMA peça, ponta a ponta: prompt derivado -> personagem -> quadro baixado
// -> PNG em disco -> declaração no manifesto.
//
// O que este arquivo garante e o cliente da API não garante sozinho: **o manifesto descreve o
// que foi realmente enviado**. O prompt gravado é a mesma string que viajou no corpo do
// pedido, não uma reconstrução — um manifesto que descreve outra coisa é pior que manifesto
// nenhum, porque dá uma resposta errada com cara de certa.

// O tabuleiro é visto de cima e a peça encara o jogador. Das oito rotações que a API produz,
// só esta é desenhada hoje: D22 escolheu UMA imagem por unidade, e as outras sete existiriam
// só para pesar no bundle. Elas continuam do lado da PixelLab, presas ao `characterId` que o
// manifesto guarda, para o dia em que virar direção de peça.
export const DIRECAO_DO_TABULEIRO: Direcao = 'south';

// M26 2/N — as duas poses da TELA DE DUELO, de três quartos, uma olhando para cada lado.
//
// Elas custam ZERO geração: `create-character-v3` produz as 8 rotações numa passada só, e até
// a 1/N o gerador baixava uma e deixava sete paradas do lado da PixelLab. O custo é download e
// ~5KB por arquivo.
//
// Três quartos e não perfil fechado (escolha do usuário): mostra rosto, arma e montaria ao
// mesmo tempo, que é o que faz reconhecer QUEM está lutando — e reconhecimento de personagem é
// o problema que D22 nomeou ao escolher esta direção de arte.
export const DIRECOES_DE_DUELO = { sudeste: 'south-east', sudoeste: 'south-west' } as const satisfies Record<
  string,
  Direcao
>;

export const LICENCA =
  'PixelLab — assinatura Tier 1, uso comercial permitido pelos termos em pixellab.ai/termsofservice';

export interface PedidoDeSprite {
  readonly cliente: ClientePixelLab;
  readonly espec: EspecificacaoDeArte;
  readonly seed: number;
  readonly frameSize: number;
  readonly dirArte: string;
  readonly dirManifesto: string;
  readonly agora?: () => Date;
  readonly detail?: string;
}

export interface ResultadoDeGeracao {
  readonly caminhoPng: string;
  readonly caminhoManifesto: string;
  readonly declaracao: UnitArt;
}

export async function gerarSprite(pedido: PedidoDeSprite): Promise<ResultadoDeGeracao> {
  const description = descricaoDe(pedido.espec);

  // Tudo que pode falhar acontece ANTES da primeira escrita. É o que faz "falhou" e "não
  // escreveu nada" serem o mesmo estado — meio manifesto apontando para um PNG que não existe
  // passaria no schema e quebraria só na tela.
  const { characterId } = await pedido.cliente.criarPersonagem({
    description,
    seed: pedido.seed,
    frameSize: pedido.frameSize,
    ...(pedido.detail ? { detail: pedido.detail } : {}),
  });
  const pronto = await pedido.cliente.esperarPersonagem(characterId);

  const url = pronto.rotations[DIRECAO_DO_TABULEIRO];
  if (!url) throw new Error(`O personagem ${characterId} ficou pronto sem a rotação ${DIRECAO_DO_TABULEIRO}.`);
  const bytes = await pedido.cliente.baixar(url);

  // As duas poses de duelo, na MESMA passada. Baixar depois exigiria uma segunda visita ao
  // personagem, e é exatamente o tipo de coisa que ninguém refaz para 50 unidades.
  const duelo: Record<string, Uint8Array> = {};
  for (const [nome, direcao] of Object.entries(DIRECOES_DE_DUELO)) {
    const u = pronto.rotations[direcao];
    if (!u) throw new Error(`O personagem ${characterId} ficou pronto sem a rotação ${direcao}.`);
    duelo[nome] = await pedido.cliente.baixar(u);
  }

  const declaracao: UnitArt = {
    unitId: pedido.espec.unitId,
    kind: 'sprite',
    arquivo: `${DIRETORIO_DE_ARTE}/${pedido.espec.unitId}.png`,
    duelo: {
      sudeste: `${DIRETORIO_DE_ARTE}/${pedido.espec.unitId}-sudeste.png`,
      sudoeste: `${DIRETORIO_DE_ARTE}/${pedido.espec.unitId}-sudoeste.png`,
    },
    frameSize: pedido.frameSize,
    procedencia: {
      ferramenta: 'pixellab',
      endpoint: '/create-character-v3',
      modelo: 'character-v3',
      prompt: description,
      seed: pedido.seed,
      characterId,
      licenca: LICENCA,
      geradoEm: (pedido.agora ?? (() => new Date()))().toISOString().slice(0, 10),
    },
  };

  mkdirSync(pedido.dirArte, { recursive: true });
  mkdirSync(pedido.dirManifesto, { recursive: true });
  const caminhoPng = join(pedido.dirArte, `${pedido.espec.unitId}.png`);
  const caminhoManifesto = join(pedido.dirManifesto, `${pedido.espec.unitId}.json`);
  writeFileSync(caminhoPng, bytes);
  for (const [nome, conteudo] of Object.entries(duelo)) {
    writeFileSync(join(pedido.dirArte, `${pedido.espec.unitId}-${nome}.png`), conteudo);
  }
  writeFileSync(caminhoManifesto, `${JSON.stringify(declaracao, null, 2)}\n`);

  return { caminhoPng, caminhoManifesto, declaracao };
}
