import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { AbaDoHub } from '../logic/tela.js';

// M35 6/N — os componentes base do sistema visual "tático clássico" (`theme.css`).
//
// Existem para que tela nova não escreva botão e painel à mão: a variante decide a classe, e
// a classe decide a pele. Nada aqui decide regra (regra 3) — são peças de apresentação.

export type VarianteDoBotao = 'primario' | 'secundario' | 'perigo';

const CLASSE_DA_VARIANTE: Readonly<Record<VarianteDoBotao, string>> = {
  secundario: 'ui-botao',
  // A primária carrega `acao-principal` porque é o mesmo conceito de D40 (uma ação principal
  // por tela), e `acaoPrincipal.test.ts` conta quem a usa.
  primario: 'ui-botao ui-botao-primario acao-principal',
  perigo: 'ui-botao ui-botao-perigo',
};

export function classeDoBotao(variante: VarianteDoBotao, extra?: string): string {
  return extra ? `${CLASSE_DA_VARIANTE[variante]} ${extra}` : CLASSE_DA_VARIANTE[variante];
}

interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variante?: VarianteDoBotao;
}

export function Botao({ variante = 'secundario', className, type = 'button', ...resto }: BotaoProps) {
  return <button type={type} className={classeDoBotao(variante, className)} {...resto} />;
}

export function Painel({
  titulo,
  className,
  children,
}: {
  readonly titulo?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className={className ? `ui-painel ${className}` : 'ui-painel'}>
      {titulo ? <h3 className="ui-painel-titulo">{titulo}</h3> : null}
      {children}
    </section>
  );
}

export function Modal({ aberto, children }: { readonly aberto: boolean; readonly children: ReactNode }) {
  if (!aberto) return null;
  return (
    <div className="ui-modal-veu" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

// O ícone de cada botão do lobby. Símbolos de texto com o seletor de variação de TEXTO
// (U+FE0E), para o Windows não trocá-los por emoji colorido: a pele é dourada, não amarela.
export const ICONES_DO_LOBBY: Readonly<Record<AbaDoHub, string>> = {
  campanha: '⚔︎',
  masmorras: '☠︎',
  arena: '⚑︎',
  personagens: '♜︎',
  invocacao: '✦︎',
};
