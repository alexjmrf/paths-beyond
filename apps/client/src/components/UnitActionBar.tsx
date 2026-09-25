import { catalog } from "../data/catalog.js";
import { acoesDaUnidade } from "../logic/acoesDaUnidade.js";
import { nomeDeUnidade } from "../logic/rotulos.js";
import { useBattleStore } from "../store/battleStore.js";
import { ehVisivelPorInteiro } from "../data/api.js";

// §5.4 — "No seu turno, uma unidade faz: mover? + uma das opções." `move`/`engage` já
// são feitos clicando no mapa (overlays de alcance/ameaça); aqui ficam `wait`/`rest` e o
// atalho pro editor de táticas (§11).
export function UnitActionBar() {
  const battleState = useBattleStore((s) => s.battleState);
  const t = useBattleStore((s) => s.t);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  const artIdByUnitId = useBattleStore((s) => s.artIdByUnitId);
  const selectedUnitId = useBattleStore((s) => s.selectedUnitId);
  const lastCommandReason = useBattleStore((s) => s.lastCommandReason);
  const waitSelectedUnit = useBattleStore((s) => s.waitSelectedUnit);
  const restSelectedUnit = useBattleStore((s) => s.restSelectedUnit);
  const openTacticsEditor = useBattleStore((s) => s.openTacticsEditor);
  const openInventory = useBattleStore((s) => s.openInventory);
  const openTalentEditor = useBattleStore((s) => s.openTalentEditor);

  const targetingMode = useBattleStore((s) => s.targetingMode);
  const beginMapSkillTargeting = useBattleStore(
    (s) => s.beginMapSkillTargeting,
  );
  const cancelTargeting = useBattleStore((s) => s.cancelTargeting);

  const unit = battleState.units.find((u) => u.unitId === selectedUnitId);

  if (!unit) {
    return (
      <div className="unit-action-bar">
        <p>{t("unidade.selecione")}</p>
      </div>
    );
  }

  // M36 4/N (D47) — do INIMIGO o cliente tem posição, HP, AP, PP e o tipo de unidade, e é
  // exatamente isso que a ficha mostra. O que ele não tem — `moveRange`, `knownSkills` — é o
  // que a barra usava para desenhar AÇÃO, e ação sobre a peça do inimigo nunca existiu (D44).
  //
  // A distinção importa: "não há o que fazer com esta peça" é diferente de "não há peça
  // selecionada", e confundir as duas foi uma regressão que a tela pegou na hora.
  const completa = ehVisivelPorInteiro(unit);
  const distanceMoved = battleState.distanceMovedThisTurn[unit.unitId] ?? 0;

  // §5.4 — "No seu turno, uma unidade faz: mover? + uma das opções", e `mapSkill` é uma
  // delas. O comando existe no core desde M3 e resolve área desde M11, mas o cliente não
  // tinha como emiti-lo: o mapa só sabia mover e engajar, então toda skill de mapa
  // autorada era inalcançável por um humano.
  const mapSkills = completa ? Object.values(unit.knownSkills).filter((skill) => skill.kind === "map") : [];

  // M35 1/N (D44) — o inimigo selecionado mostra a FICHA, e nenhuma ação. A decisão é de
  // `acoesDaUnidade`; aqui só se desenha o que ela devolve. As skills de mapa são ação e
  // seguem a mesma regra.
  const acoes = acoesDaUnidade(unit.side);

  return (
    <div className="unit-action-bar">
      <h3>
        {nomeDeUnidade(t, unit.unitId, heroesByUnitId, artIdByUnitId, catalog)}
      </h3>
      <p>{t("unidade.stats", { hp: unit.hp, ap: unit.ap, pp: unit.pp })}</p>
      {/* Quanto a unidade já andou só faz sentido contra o alcance DELA, e o alcance do
          inimigo é oculto (D47). Para ele a linha some; a ficha continua dizendo o que importa
          no tabuleiro — quem é, quanto de vida tem e quanto de recurso lhe resta. */}
      {completa ? <p>{t("unidade.moveu", { andou: distanceMoved, alcance: unit.moveRange })}</p> : null}
      {acoes.length === 0 ? null : (
        <div className="actions">
          <button
            type="button"
            disabled={unit.hasActedThisRound}
            onClick={waitSelectedUnit}
          >
            {t("unidade.esperar")}
          </button>
          <button
            type="button"
            disabled={unit.hasActedThisRound}
            onClick={restSelectedUnit}
          >
            {t("unidade.descansar")}
          </button>
          {mapSkills.map((skill) => {
            const targeting =
              targetingMode?.kind === "mapSkill" &&
              targetingMode.skillId === skill.id;
            // `mapSkills` só é preenchida para a unidade completa, então o cooldown existe aqui.
            const cooldown = ehVisivelPorInteiro(unit) ? (unit.cooldowns[skill.id] ?? 0) : 0;
            return (
              <button
                key={skill.id}
                type="button"
                className={targeting ? "targeting" : ""}
                disabled={
                  unit.hasActedThisRound ||
                  unit.ap < skill.apCost ||
                  cooldown > 0
                }
                onClick={() =>
                  targeting
                    ? cancelTargeting()
                    : beginMapSkillTargeting(skill.id)
                }
              >
                {t("unidade.skillCusto", {
                  skill: skill.name,
                  custo: skill.apCost,
                  area: skill.areaRadius
                    ? t("unidade.area", { raio: skill.areaRadius })
                    : "",
                })}
              </button>
            );
          })}
          <button type="button" onClick={() => openTacticsEditor(unit.unitId)}>
            {t("unidade.editarTaticas")}
          </button>
          <button type="button" onClick={() => openInventory(unit.unitId)}>
            {t("unidade.inventario")}
          </button>
          <button type="button" onClick={() => openTalentEditor(unit.unitId)}>
            {t("unidade.talentos")}
          </button>
        </div>
      )}
      {targetingMode?.kind === "mapSkill" ? (
        <p className="targeting-hint">{t("unidade.mireNoAlcance")}</p>
      ) : null}
      {lastCommandReason ? <p className="error">{lastCommandReason}</p> : null}
    </div>
  );
}
