import { ABAS_DO_HUB } from '../logic/tela.js';
import { useBattleStore } from '../store/battleStore.js';

// M35 1/N (D41) — o menu do hub. Uma barra, cinco abas, e só a aba escolhida na tela.
//
// A aba ativa NÃO carrega a classe da ação principal (D40): o menu é navegação, e a de cada aba
// mora dentro dela (a próxima missão, invocar, enviar a batalha). Dois pesos visuais no mesmo
// nível seriam de novo "tudo misturado".
export function MenuDoHub() {
  const aba = useBattleStore((s) => s.abaDoHub);
  const escolherAba = useBattleStore((s) => s.escolherAba);
  const t = useBattleStore((s) => s.t);

  return (
    <nav className="menu-do-hub" aria-label={t('app.titulo')}>
      {ABAS_DO_HUB.map((candidata) => (
        <button
          key={candidata}
          type="button"
          className={candidata === aba ? 'aba ativa' : 'aba'}
          aria-current={candidata === aba ? 'page' : undefined}
          onClick={() => escolherAba(candidata)}
        >
          {t(`menu.${candidata}`)}
        </button>
      ))}
    </nav>
  );
}
