import { nomeDeConteudo } from '../i18n/conteudo.js';
import { descreverObjetivo } from '../logic/objetivo.js';
import { useBattleStore } from '../store/battleStore.js';

// M12, sub-sessão 4/N — o objetivo do mapa na tela.
//
// Até M11 toda condição de vitória era `rout` e não havia o que explicar: mate todo mundo.
// Com a campanha real (sub-sessão 3/N) o jogador entra num mapa de `defend` sem saber que
// tile precisa segurar nem por quantos rounds, e num de `escort` sem saber quem morre a
// partida se morrer. Sem isto os 4 objetivos novos existem só no JSON.
//
// M32 — o texto saiu daqui para `logic/objetivo.ts`, e passa pela camada de idioma: as cinco
// condições estavam em português em template literal, invisíveis para `semTextoCru`.

// §5.6 — "Valor: recurso de exército." Usar não consome o turno de ninguém, então o painel
// fica sempre disponível, e não só quando há unidade selecionada.
function ValorSection() {
  const battleState = useBattleStore((s) => s.battleState);
  const t = useBattleStore((s) => s.t);
  const targetingMode = useBattleStore((s) => s.targetingMode);
  const beginValorTargeting = useBattleStore((s) => s.beginValorTargeting);
  const cancelTargeting = useBattleStore((s) => s.cancelTargeting);

  const skills = Object.values(battleState.valorSkills ?? {});

  return (
    <div className="valor-section">
      <h3>
        {t('valor.titulo')} <span className="valor-amount">{battleState.valor}</span>
      </h3>
      {skills.length === 0 ? (
        <p className="hint">{t('valor.semSkills')}</p>
      ) : (
        <ul className="valor-skills">
          {skills.map((skill) => {
            const targeting = targetingMode?.kind === 'valor' && targetingMode.skillId === skill.id;
            // `summonReinforcement` não tem resolução (decisão registrada em M11 3/N): o
            // core rejeita alto em vez de gastar Valor em silêncio, e o botão diz isso
            // antes de o jogador tentar.
            const unsupported = skill.kind === 'summonReinforcement';
            return (
              <li key={skill.id}>
                <button
                  type="button"
                  className={targeting ? 'targeting' : ''}
                  disabled={battleState.valor < skill.cost || unsupported}
                  onClick={() => (targeting ? cancelTargeting() : beginValorTargeting(skill.id))}
                  title={unsupported ? t('valor.semResolucao') : skill.kind}
                >
                  {nomeDeConteudo(t, 'valor', skill.id, skill.name)} <span className="cost">{t('valor.custo', { custo: skill.cost })}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {targetingMode?.kind === 'valor' ? (
        <p className="targeting-hint">{t('valor.mireNoMapa')}</p>
      ) : null}
    </div>
  );
}

export function ObjectivePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const tObjetivo = useBattleStore((s) => s.t);
  const objective = descreverObjetivo(tObjetivo, battleState.winCondition, battleState);

  return (
    <section className="objective-panel">
      <h2>{tObjetivo('objetivo.titulo')}</h2>
      <p className="objective-title">{objective.titulo}</p>
      <p className="objective-detail">{objective.detalhe}</p>
      <p className="round-counter">{tObjetivo('objetivo.round', { round: battleState.round })}</p>
      <ValorSection />
    </section>
  );
}
