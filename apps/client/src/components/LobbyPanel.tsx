import { ABAS_DO_HUB, type AbaDoHub } from '../logic/tela.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 5/N (D41, revisada) — o LOBBY: a tela principal com um botão por tela.
//
// A 1/N desenhou uma barra de abas; o usuário julgou na tela e pediu a forma do gênero —
// botões numa tela principal, uma transição, e "voltar". Cada botão leva uma linha do que há
// lá dentro (o capítulo em curso, a energia, a moeda premium), lida da store que o sign-in já
// carregou: é o que faz o lobby dizer alguma coisa em vez de ser cinco palavras.
//
// A ação principal de quem chega é a CAMPANHA (D40): é o único botão com peso maior. Estilo
// (cor, arte de botão, animação) é passagem futura por decisão do usuário; aqui é estrutura.
export function LobbyPanel() {
  const escolherAba = useBattleStore((s) => s.escolherAba);
  const t = useBattleStore((s) => s.t);
  const campaign = useBattleStore((s) => s.campaign);
  const pve = useBattleStore((s) => s.pve);
  const pvp = useBattleStore((s) => s.pvp);
  const summon = useBattleStore((s) => s.summon);

  // A linha de cada botão. O capítulo "em curso" é o primeiro por limpar; sem campanha
  // carregada (leitura ainda no ar, ou erro), a linha fica vazia em vez de inventar.
  const capituloEmCurso = campaign.chapters.find((c) => !c.cleared) ?? campaign.chapters[campaign.chapters.length - 1];
  const resumo: Readonly<Record<AbaDoHub, string>> = {
    campanha: capituloEmCurso
      ? t('lobby.resumo.campanha', {
          capitulo: capituloEmCurso.order,
          limpas: capituloEmCurso.missions.filter((m) => m.cleared).length,
          total: capituloEmCurso.missions.length,
        })
      : '',
    masmorras: pve.economy ? t('lobby.resumo.masmorras', { energia: pve.economy.energy.stored, teto: pve.economy.energyMax }) : '',
    arena: pvp.me ? t('lobby.resumo.arena', { elo: pvp.me.elo }) : '',
    personagens: t('lobby.resumo.personagens', { total: pvp.roster.length }),
    invocacao: t('lobby.resumo.invocacao', { premium: summon.premium }),
  };

  return (
    <nav className="lobby" aria-label={t('app.titulo')}>
      {ABAS_DO_HUB.map((aba) => (
        <button
          key={aba}
          type="button"
          className={aba === 'campanha' ? 'lobby-botao acao-principal' : 'lobby-botao'}
          onClick={() => escolherAba(aba)}
        >
          <span className="lobby-nome">{t(`menu.${aba}`)}</span>
          <span className="lobby-resumo">{resumo[aba]}</span>
        </button>
      ))}
    </nav>
  );
}
