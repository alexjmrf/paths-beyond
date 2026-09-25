// M35 7/N — a Campanha em cartões: qual capítulo está em foco e o estado de cada cartão.
//
// Funções puras pelo mesmo motivo de `telaDoJogo`: o que o projeto testa é a lógica, e uma
// decisão que só existe no componente só se prova abrindo o navegador. Nada aqui é regra de
// jogo — é o que a tela mostra primeiro.

interface MissaoMinima {
  readonly id: string;
  readonly cleared: boolean;
}

interface CapituloMinimo {
  readonly id: string;
  readonly missions: readonly MissaoMinima[];
}

/**
 * O capítulo cuja aba está aberta: o que o jogador clicou; senão o da missão escolhida; senão o
 * da próxima por limpar (onde ele parou); senão o último.
 */
export function capituloEmFoco(
  capitulos: readonly CapituloMinimo[],
  escolhido: string | null,
  missaoEscolhida: string | null,
): string | null {
  if (capitulos.length === 0) return null;
  if (escolhido && capitulos.some((c) => c.id === escolhido)) return escolhido;
  const daMissao = capitulos.find((c) => c.missions.some((m) => m.id === missaoEscolhida));
  if (daMissao) return daMissao.id;
  const emCurso = capitulos.find((c) => c.missions.some((m) => !m.cleared));
  return (emCurso ?? capitulos[capitulos.length - 1]!).id;
}

export type EstadoDoCartao = 'limpa' | 'proxima' | 'disponivel';

/** `proxima` é a missão que o jogador deve jogar agora (D40): a primeira por limpar. */
export function estadoDoCartao(missao: MissaoMinima, proximaId: string | null): EstadoDoCartao {
  if (missao.cleared) return 'limpa';
  return missao.id === proximaId ? 'proxima' : 'disponivel';
}
