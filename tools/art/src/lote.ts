import type { EspecificacaoDeArte } from './prompt.js';

// M26 3/N — o elenco inteiro numa passada.
//
// A 1/N e a 2/N geraram DUAS peças, e o que sobrou é o volume: 48 unidades. `gerar <unitId>`
// resolve uma; o critério de aceite pede um script **repetível**, e 48 invocações à mão não
// são repetíveis por ninguém — nem hoje, nem no dia em que o bloco de estilo de `prompt.ts`
// mudar e o elenco tiver de nascer de novo.
//
// Este arquivo não fala com a PixelLab: `gerarUma` é injetada. Isso não é purismo de teste —
// é o que permite afirmar as três propriedades que só o LOTE tem, sem `fetch` falso e sem
// gastar geração da assinatura.

/** Uma seed estável por unidade — a mesma que o `cli.ts` usava desde a 1/N.
 *
 * Sem `Math.random`: a regra 1 fala de `packages/core`, mas um gerador que sorteasse a seed
 * transformaria o manifesto em anotação do que aconteceu, em vez da receita que o regera. É a
 * mesma diferença que separa procedência de decoração.
 *
 * FNV-1a, 32 bits, porque é o que a API aceita como seed e porque cabe em cinco linhas. */
export function seedDe(unitId: string): number {
  let h = 2166136261;
  for (let i = 0; i < unitId.length; i++) {
    h ^= unitId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type EstadoDaPeca = 'ok' | 'falha';

export interface EventoDeLote {
  readonly unitId: string;
  readonly estado: EstadoDaPeca;
  readonly erro?: string;
  /** Quantas peças o lote já terminou, desta e das outras — inclusive. */
  readonly feitas: number;
  readonly total: number;
}

export interface PedidoDeLote {
  readonly specs: readonly EspecificacaoDeArte[];
  /** O teto de trabalhos EM VOO. Ver o comentário de `eFilaCheia` em `pixellab.ts`. */
  readonly paralelo: number;
  /** "Esta unidade já tem sprite declarado?" — lido do manifesto pelo chamador. */
  readonly jaTemSprite: (unitId: string) => boolean;
  readonly gerarUma: (espec: EspecificacaoDeArte, seed: number) => Promise<unknown>;
  /** Regerar quem já tem arte. É como uma mudança de estilo alcança o elenco inteiro. */
  readonly refazer?: boolean;
  /** Um pedaço do lote, na ordem da lista. Conta o que vai GERAR, não o que vai percorrer. */
  readonly somente?: number;
  readonly aoTerminar?: (evento: EventoDeLote) => void;
}

export interface RelatorioDeLote {
  readonly geradas: readonly string[];
  readonly puladas: readonly string[];
  readonly falhas: readonly { readonly unitId: string; readonly erro: string }[];
}

export async function gerarLote(pedido: PedidoDeLote): Promise<RelatorioDeLote> {
  const puladas: string[] = [];
  const aFazer: EspecificacaoDeArte[] = [];

  // A triagem acontece INTEIRA antes da primeira geração, e é o que faz `--somente N` contar
  // peças geradas em vez de posições na lista. A diferença só aparece ao retomar — e retomar é
  // o caso normal, porque uma execução de meia hora vai ser interrompida.
  for (const espec of pedido.specs) {
    if (!pedido.refazer && pedido.jaTemSprite(espec.unitId)) {
      puladas.push(espec.unitId);
      continue;
    }
    if (pedido.somente !== undefined && aFazer.length >= pedido.somente) break;
    aFazer.push(espec);
  }

  const geradas: string[] = [];
  const falhas: { unitId: string; erro: string }[] = [];
  let proxima = 0;
  let feitas = 0;

  // Um pool de trabalhadores, e não `Promise.all` sobre fatias de tamanho fixo: com fatias, uma
  // peça lenta deixa os outros trabalhadores parados até a fatia inteira acabar, e o tempo de
  // geração varia muito entre um soldado a pé e uma cavaleira montada num grifo.
  async function trabalhador(): Promise<void> {
    for (;;) {
      const espec = aFazer[proxima++];
      if (!espec) return;
      try {
        await pedido.gerarUma(espec, seedDe(espec.unitId));
        geradas.push(espec.unitId);
        feitas += 1;
        pedido.aoTerminar?.({ unitId: espec.unitId, estado: 'ok', feitas, total: aFazer.length });
      } catch (erro) {
        // Uma peça que falha NÃO derruba o lote. Ela é uma unidade entre cinquenta, e a
        // alternativa — abortar — jogaria fora o trabalho já pago das outras quarenta e nove.
        // O relatório final a nomeia, e rodar de novo tenta só ela (as prontas são puladas).
        const mensagem = erro instanceof Error ? erro.message : String(erro);
        falhas.push({ unitId: espec.unitId, erro: mensagem });
        feitas += 1;
        pedido.aoTerminar?.({ unitId: espec.unitId, estado: 'falha', erro: mensagem, feitas, total: aFazer.length });
      }
    }
  }

  const trabalhadores = Array.from({ length: Math.max(1, Math.min(pedido.paralelo, aFazer.length)) }, () =>
    trabalhador(),
  );
  await Promise.all(trabalhadores);

  return { geradas, puladas, falhas };
}
