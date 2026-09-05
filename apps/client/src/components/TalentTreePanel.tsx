import { STAT_KEYS, type StatKey, type TalentEffect } from '@paths-beyond/core';
import { useState } from 'react';
import { catalog } from '../data/catalog.js';
import type { Tradutor } from '../i18n/idioma.js';
import { encodeBuildCode } from '../logic/buildCode.js';
import {
  availabilityByNode,
  layoutColumnTree,
  pointsSpent,
  TALENT_POINT_BUDGET,
  type PositionedTalentNode,
} from '../logic/talentLayout.js';
import { previewTalents } from '../logic/talentPreview.js';
import { characterTreeForUnit, useBattleStore } from '../store/battleStore.js';

const ROW_HEIGHT = 88;
const COL_WIDTH = 168;
const NODE_W = 138;
const NODE_H = 54;
const MARGIN = 24;
const COLS = 3;

function nodeCenter(p: PositionedTalentNode): { x: number; y: number } {
  return {
    x: MARGIN + p.col * COL_WIDTH + NODE_W / 2,
    y: MARGIN + (p.row - 1) * ROW_HEIGHT + NODE_H / 2,
  };
}

// M25 — o tradutor entra por PARÂMETRO e não por import da store: assim a função continua
// pura (mesma entrada, mesma saída) e testável sem montar o estado do jogo.
function describeEffect(effect: TalentEffect, t: Tradutor): string {
  switch (effect.t) {
    case 'stat': {
      const parts: string[] = [];
      if (effect.flat !== undefined) parts.push(`${effect.flat >= 0 ? '+' : ''}${effect.flat}`);
      if (effect.pct !== undefined) parts.push(`${effect.pct >= 0 ? '+' : ''}${effect.pct / 10}%`);
      return `${effect.stat} ${parts.join(' ')}`;
    }
    case 'grantSkill':
      return t('efeito.grantSkill', { skill: effect.skillId });
    case 'grantReaction':
      return t('efeito.grantReaction', { reacao: effect.reactionId });
    case 'modifySkill':
      return t('efeito.modifySkill', { skill: effect.skillId });
    case 'extraTacticsSlot':
      return t('efeito.extraTacticsSlot');
    case 'extraTacticsCondition':
      return t('efeito.extraTacticsCondition');
    case 'maxAp':
      return t('efeito.maxAp', { n: effect.n });
    case 'maxPp':
      return t('efeito.maxPp', { n: effect.n });
    case 'apRefund':
      return t('efeito.apRefund', { n: effect.n, quando: t(`efeito.apRefund.${effect.on}`) });
    case 'duelApCap':
      return t('efeito.duelApCap', { n: effect.n });
    case 'assistRangeBonus':
      return t('efeito.assistRangeBonus', { n: effect.n });
    case 'passive':
      return t('efeito.passive', { passiva: effect.passiveId });
  }
}

// Rótulo curto do nó — remove o prefixo `talent-<primeiro-nome-do-personagem>-` pra caber no
// retângulo. §8.2 (M17): as árvores passaram a ser nomeadas pela PESSOA (`talent-miron-…`,
// `talent-sylla-…`) e não pela classe, então o prefixo é sempre um segmento só.
function shortNodeLabel(nodeId: string): string {
  return nodeId.replace(/^talent-[^-]+-/, '');
}

// M25 — os títulos das colunas viraram chave; a ORDEM continua sendo a do desenho
// (§8.2: coluna A, o nó do meio, coluna B).
const COLUMN_TITLE_KEYS = ['talento.colunaA', 'talento.convergencia', 'talento.colunaB'] as const;

function statDeltaRow(stat: StatKey, before: number, after: number) {
  const delta = after - before;
  if (delta === 0) return null;
  return (
    <li key={stat} className={delta > 0 ? 'gain' : 'loss'}>
      {stat}: {before} → {after} ({delta > 0 ? '+' : ''}
      {delta})
    </li>
  );
}

// §11 — "Talentos: Grafo, preview do efeito, string de build compartilhável."
//
// §8.2 (M17, sub-sessão 4/N) — o grafo passou a ser a forma de §8.2: duas colunas presentes
// em todas as linhas, uma coluna do meio ocasional, UM nó por linha, e a coluna amarrando a
// linha seguinte. As abas Classe/Especialização saíram junto com as duas árvores por classe.
//
// A tela não decide nada: quais nós podem ser clicados vem de `availabilityByNode`, que
// pergunta ao core (regra 3). O que a tela decide é o que é DESENHADO — a trilha do caminho,
// o nó apagado, e o motivo em português vindo do core sem reescrita.
export function TalentTreePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const t = useBattleStore((s) => s.t);
  const heroesByUnitId = useBattleStore((s) => s.heroesByUnitId);
  const talentEditorUnitId = useBattleStore((s) => s.talentEditorUnitId);
  const talentAllocationByUnit = useBattleStore((s) => s.talentAllocationByUnit);
  const lastTalentReason = useBattleStore((s) => s.lastTalentReason);
  const closeTalentEditor = useBattleStore((s) => s.closeTalentEditor);
  const allocateTalent = useBattleStore((s) => s.allocateTalent);
  const deallocateTalent = useBattleStore((s) => s.deallocateTalent);
  const resetTalentTree = useBattleStore((s) => s.resetTalentTree);
  const loadBuildCode = useBattleStore((s) => s.loadBuildCode);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [buildCodeInput, setBuildCodeInput] = useState('');

  const unit = battleState.units.find((u) => u.unitId === talentEditorUnitId);
  if (!talentEditorUnitId || !unit) return null;

  // §8.1 — a árvore é do PERSONAGEM. Uma unidade sem personagem (inimigo de fase, reforço
  // invocado) não tem árvore para abrir, e a tela diz isso em vez de mostrar um grafo vazio
  // que pareceria uma árvore sem talentos.
  const tree = characterTreeForUnit(heroesByUnitId, talentEditorUnitId);
  if (!tree) {
    return (
      <div className="talent-tree-overlay">
        <div className="talent-tree-panel">
          <h2>Talentos — {unit.unitId}</h2>
          <p className="talent-hint">{t('talento.semArvore')}</p>
          <div className="talent-editor-actions">
            <button type="button" onClick={closeTalentEditor}>
              {t('talento.fechar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const personagem = catalog.characters[tree.characterId];
  const allocation = talentAllocationByUnit[unit.unitId] ?? {};
  const layout = layoutColumnTree(tree);
  const availability = availabilityByNode({ tree, allocation });

  const gastos = pointsSpent(allocation);
  const selectedPositioned = selectedNodeId ? layout.find((p) => p.node.id === selectedNodeId) : undefined;
  const selectedNode = selectedPositioned?.node;
  const selectedAvailability = selectedNode ? availability.get(selectedNode.id) : undefined;

  const preview = previewTalents(unit.stats, tree.nodes, allocation);

  const svgWidth = MARGIN * 2 + COLS * COL_WIDTH;
  const svgHeight = MARGIN * 2 + tree.depth * ROW_HEIGHT;

  // A trilha do caminho: o segmento que liga a linha N à linha N+1, desenhado só entre nós
  // efetivamente alocados. É o que faz a build se ler como uma descida e não como nós soltos
  // acesos — a leitura que §8.2 quer, já que a árvore é literalmente um caminho.
  const alocadosPorLinha = new Map<number, PositionedTalentNode>();
  for (const p of layout) {
    if ((allocation[p.node.id] ?? 0) > 0) alocadosPorLinha.set(p.row, p);
  }

  const currentCode = encodeBuildCode({ characterId: tree.characterId, talents: allocation });

  return (
    <div className="talent-tree-overlay">
      <div className="talent-tree-panel">
        <h2>
          Talentos — {personagem?.name ?? tree.characterId}
          <span className="talent-subtitle"> ({unit.unitId})</span>
        </h2>

        <div className="talent-tabs">
          <span className="talent-points">
            {gastos} / {TALENT_POINT_BUDGET} pontos
          </span>
          <span className="talent-depth">{tree.depth} linhas</span>
          <button type="button" onClick={() => resetTalentTree(unit.unitId, 1)} disabled={gastos === 0}>
            Resetar árvore
          </button>
        </div>

        <svg className="talent-graph" width={svgWidth} height={svgHeight}>
          <g className="talent-column-titles">
            {COLUMN_TITLE_KEYS.map((chave, col) => (
              <text key={chave} x={MARGIN + col * COL_WIDTH + NODE_W / 2} y={14} textAnchor="middle">
                {t(chave)}
              </text>
            ))}
          </g>

          {[...alocadosPorLinha.keys()]
            .filter((row) => alocadosPorLinha.has(row + 1))
            .map((row) => {
              const from = nodeCenter(alocadosPorLinha.get(row)!);
              const to = nodeCenter(alocadosPorLinha.get(row + 1)!);
              return (
                <line
                  key={`trilha-${row}`}
                  className="talent-path"
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  strokeWidth={4}
                />
              );
            })}

          {layout.map((p) => {
            const center = nodeCenter(p);
            const rank = allocation[p.node.id] ?? 0;
            const disponivel = availability.get(p.node.id)?.canAllocate ?? false;
            const isSelected = p.node.id === selectedNodeId;
            const classes = [
              'talent-node',
              `col-${p.node.column}`,
              rank > 0 ? 'allocated' : '',
              !disponivel && rank === 0 ? 'locked' : '',
              isSelected ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <g
                key={p.node.id}
                transform={`translate(${center.x - NODE_W / 2}, ${center.y - NODE_H / 2})`}
                className={classes}
                onClick={() => setSelectedNodeId(p.node.id)}
              >
                <rect width={NODE_W} height={NODE_H} rx={p.node.column === 'middle' ? 26 : 8} />
                <text x={NODE_W / 2} y={22} textAnchor="middle">
                  {shortNodeLabel(p.node.id)}
                </text>
                <text x={NODE_W / 2} y={40} textAnchor="middle" className="rank">
                  L{p.node.row} · {rank}/{p.node.maxRank}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedNode ? (
          <div className="talent-node-details">
            <h3>{shortNodeLabel(selectedNode.id)}</h3>
            <p>
              {t('talento.no', {
                linha: selectedNode.row,
                coluna:
                  selectedNode.column === 'middle'
                    ? t('talento.colunaDoMeio')
                    : t('talento.colunaLetra', { letra: selectedNode.column.toUpperCase() }),
                rank: allocation[selectedNode.id] ?? 0,
                teto: selectedNode.maxRank,
              })}
            </p>
            <ul>
              {selectedNode.effects.map((effect, i) => (
                <li key={i}>{describeEffect(effect, t)}</li>
              ))}
            </ul>
            {selectedNode.minAwakening !== undefined ? (
              <p className="requires">{t('talento.exigeDespertar', { nivel: selectedNode.minAwakening })}</p>
            ) : null}
            {selectedAvailability?.blockedReason ? (
              // O motivo é o do core, sem reescrita: se a tela explicasse por conta própria,
              // a explicação e a regra divergiriam, e a da tela é a que o jogador lê.
              <p className="requires">{selectedAvailability.blockedReason}</p>
            ) : null}
            <div className="talent-node-actions">
              <button
                type="button"
                disabled={!selectedAvailability?.canAllocate}
                onClick={() => allocateTalent(unit.unitId, selectedNode.id)}
              >
                +1
              </button>
              <button
                type="button"
                disabled={!selectedAvailability?.canDeallocate}
                onClick={() => deallocateTalent(unit.unitId, selectedNode.id)}
              >
                -1
              </button>
              {/* Desfazer um caminho é desfazê-lo da ponta para trás (§8.2): tirar o ponto de
                  uma linha do meio deixaria as de baixo penduradas, e o core recusa. Este
                  botão é a saída, e é por isso que ele existe ao lado do -1 e não escondido
                  num menu. */}
              <button type="button" onClick={() => resetTalentTree(unit.unitId, selectedNode.row)}>
                Resetar da linha {selectedNode.row} para baixo
              </button>
            </div>
          </div>
        ) : (
          <p className="talent-hint">{t('talento.cliqueNoNo')}</p>
        )}

        {lastTalentReason ? <p className="error">{lastTalentReason}</p> : null}

        <div className="talent-preview">
          <h3>{t('talento.efeitoTotal')}</h3>
          <ul>{STAT_KEYS.map((stat) => statDeltaRow(stat, preview.statsBefore[stat], preview.statsAfter[stat]))}</ul>
          <p>
            Poder de combate: {preview.cpBefore} → {preview.cpAfter} (
            {preview.cpAfter - preview.cpBefore >= 0 ? '+' : ''}
            {preview.cpAfter - preview.cpBefore})
          </p>
        </div>

        <div className="talent-build-code">
          <h3>{t('talento.buildCode')}</h3>
          <label>
            {t('talento.codigoAtual')}
            <textarea readOnly value={currentCode} rows={2} />
          </label>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(currentCode).catch(() => undefined);
            }}
          >
            {t('talento.copiar')}
          </button>

          <label>
            {t('talento.colar')}
            <textarea value={buildCodeInput} onChange={(e) => setBuildCodeInput(e.target.value)} rows={2} />
          </label>
          <button type="button" onClick={() => loadBuildCode(unit.unitId, buildCodeInput)}>
            {t('talento.carregar')}
          </button>
        </div>

        <div className="talent-editor-actions">
          <button type="button" onClick={closeTalentEditor}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
