import { STAT_KEYS, type StatKey, type TalentEffect, type TalentTree } from '@paths-beyond/core';
import { useState } from 'react';
import { DEMO_CLASS_ID, classTreeLayout, specTreeLayout, type PositionedTalentNode } from '../data/campaign/talents.js';
import { encodeBuildCode } from '../logic/buildCode.js';
import { previewTalents } from '../logic/talentPreview.js';
import { useBattleStore } from '../store/battleStore.js';

const ROW_HEIGHT = 90;
const COL_WIDTH = 150;
const NODE_W = 120;
const NODE_H = 56;
const MARGIN = 20;
const COLS = 3;
const ROWS = 8;

function nodeCenter(p: PositionedTalentNode): { x: number; y: number } {
  return {
    x: MARGIN + p.col * COL_WIDTH + NODE_W / 2,
    y: MARGIN + (p.node.row - 1) * ROW_HEIGHT + NODE_H / 2,
  };
}

function describeEffect(effect: TalentEffect): string {
  switch (effect.t) {
    case 'stat': {
      const parts: string[] = [];
      if (effect.flat !== undefined) parts.push(`${effect.flat >= 0 ? '+' : ''}${effect.flat}`);
      if (effect.pct !== undefined) parts.push(`${effect.pct >= 0 ? '+' : ''}${effect.pct / 10}%`);
      return `${effect.stat} ${parts.join(' ')}`;
    }
    case 'grantSkill':
      return `Concede skill: ${effect.skillId}`;
    case 'grantReaction':
      return `Concede reação: ${effect.reactionId}`;
    case 'modifySkill':
      return `Modifica skill ${effect.skillId}`;
    case 'extraTacticsSlot':
      return '+1 linha no editor de táticas';
    case 'extraTacticsCondition':
      return '+1 condição por linha de tática';
    case 'maxAp':
      return `+${effect.n} AP máximo (batalha)`;
    case 'maxPp':
      return `+${effect.n} PP máximo (batalha)`;
    case 'apRefund':
      return `+${effect.n} AP ao ${effect.on === 'kill' ? 'abater' : effect.on === 'duelWon' ? 'vencer duelo' : 'assistir'}`;
    case 'duelApCap':
      return `+${effect.n} no teto de AP por duelo`;
    case 'assistRangeBonus':
      return `+${effect.n} alcance de assistência`;
    case 'passive':
      return `Passiva: ${effect.passiveId}`;
  }
}

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

// §11 — "Talentos: Grafo, preview do efeito, string de build compartilhável." Grafo é um
// grid linha/coluna (row 1..8 no eixo Y, 3 colunas fixas no eixo X — posição vem de
// `PositionedTalentNode.col`, dado só pelo cliente, `TalentNode` do core não tem noção de
// layout visual) com um SVG desenhando as arestas de `requires` por baixo dos nós.
export function TalentTreePanel() {
  const battleState = useBattleStore((s) => s.battleState);
  const talentEditorUnitId = useBattleStore((s) => s.talentEditorUnitId);
  const talentAllocationByUnit = useBattleStore((s) => s.talentAllocationByUnit);
  const lastTalentReason = useBattleStore((s) => s.lastTalentReason);
  const closeTalentEditor = useBattleStore((s) => s.closeTalentEditor);
  const allocateTalent = useBattleStore((s) => s.allocateTalent);
  const deallocateTalent = useBattleStore((s) => s.deallocateTalent);
  const resetTalentTree = useBattleStore((s) => s.resetTalentTree);
  const loadBuildCode = useBattleStore((s) => s.loadBuildCode);

  const [activeTree, setActiveTree] = useState<TalentTree>('class');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [buildCodeInput, setBuildCodeInput] = useState('');

  const unit = battleState.units.find((u) => u.unitId === talentEditorUnitId);
  if (!talentEditorUnitId || !unit) return null;

  const allocation = talentAllocationByUnit[unit.unitId] ?? {};
  const layout = activeTree === 'class' ? classTreeLayout : specTreeLayout;

  const pointsSpent = layout.reduce((sum, p) => sum + (allocation[p.node.id] ?? 0), 0);
  const selectedPositioned = selectedNodeId ? layout.find((p) => p.node.id === selectedNodeId) : undefined;
  const selectedNode = selectedPositioned?.node;

  const preview = previewTalents(unit.stats, [...classTreeLayout, ...specTreeLayout].map((p) => p.node), allocation);

  const svgWidth = MARGIN * 2 + COLS * COL_WIDTH;
  const svgHeight = MARGIN * 2 + ROWS * ROW_HEIGHT;

  const currentCode = encodeBuildCode({ classId: DEMO_CLASS_ID, talents: allocation });

  return (
    <div className="talent-tree-overlay">
      <div className="talent-tree-panel">
        <h2>Talentos — {unit.unitId}</h2>

        <div className="talent-tabs">
          <button type="button" disabled={activeTree === 'class'} onClick={() => setActiveTree('class')}>
            Classe
          </button>
          <button type="button" disabled={activeTree === 'spec'} onClick={() => setActiveTree('spec')}>
            Especialização
          </button>
          <span className="talent-points">
            {pointsSpent} / 8 pontos
          </span>
          <button type="button" onClick={() => resetTalentTree(unit.unitId, activeTree)}>
            Resetar árvore
          </button>
        </div>

        <svg className="talent-graph" width={svgWidth} height={svgHeight}>
          {layout.flatMap((p) =>
            (p.node.requires ?? []).map((reqId) => {
              const reqPositioned = layout.find((other) => other.node.id === reqId);
              if (!reqPositioned) return null;
              const from = nodeCenter(reqPositioned);
              const to = nodeCenter(p);
              return (
                <line
                  key={`${reqId}->${p.node.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="#374151"
                  strokeWidth={2}
                />
              );
            }),
          )}

          {layout.map((p) => {
            const center = nodeCenter(p);
            const rank = allocation[p.node.id] ?? 0;
            const isSelected = p.node.id === selectedNodeId;
            return (
              <g
                key={p.node.id}
                transform={`translate(${center.x - NODE_W / 2}, ${center.y - NODE_H / 2})`}
                className={`talent-node${rank > 0 ? ' allocated' : ''}${isSelected ? ' selected' : ''}`}
                onClick={() => setSelectedNodeId(p.node.id)}
              >
                <rect width={NODE_W} height={NODE_H} rx={8} />
                <text x={NODE_W / 2} y={22} textAnchor="middle">
                  {p.node.id.replace(/^t-(classe|spec)-/, '')}
                </text>
                <text x={NODE_W / 2} y={40} textAnchor="middle" className="rank">
                  {rank}/{p.node.maxRank}
                </text>
              </g>
            );
          })}
        </svg>

        {selectedNode ? (
          <div className="talent-node-details">
            <h3>{selectedNode.id}</h3>
            <p>
              Linha {selectedNode.row} · rank {allocation[selectedNode.id] ?? 0}/{selectedNode.maxRank}
            </p>
            <ul>
              {selectedNode.effects.map((effect, i) => (
                <li key={i}>{describeEffect(effect)}</li>
              ))}
            </ul>
            {selectedNode.requires ? <p className="requires">requer: {selectedNode.requires.join(', ')}</p> : null}
            {selectedNode.exclusiveWith ? (
              <p className="requires">exclusivo com: {selectedNode.exclusiveWith.join(', ')}</p>
            ) : null}
            <div className="talent-node-actions">
              <button type="button" onClick={() => allocateTalent(unit.unitId, selectedNode.id)}>
                +1
              </button>
              <button type="button" onClick={() => deallocateTalent(unit.unitId, selectedNode.id)}>
                -1
              </button>
            </div>
          </div>
        ) : (
          <p className="talent-hint">Clique num nó pra ver o efeito.</p>
        )}

        {lastTalentReason ? <p className="error">{lastTalentReason}</p> : null}

        <div className="talent-preview">
          <h3>Efeito total da build (delta sobre os stats atuais)</h3>
          <ul>{STAT_KEYS.map((stat) => statDeltaRow(stat, preview.statsBefore[stat], preview.statsAfter[stat]))}</ul>
          <p>
            CP: {preview.cpBefore} → {preview.cpAfter} (
            {preview.cpAfter - preview.cpBefore >= 0 ? '+' : ''}
            {preview.cpAfter - preview.cpBefore})
          </p>
        </div>

        <div className="talent-build-code">
          <h3>Build compartilhável</h3>
          <label>
            Código atual
            <textarea readOnly value={currentCode} rows={2} />
          </label>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(currentCode).catch(() => undefined);
            }}
          >
            Copiar código
          </button>

          <label>
            Colar código
            <textarea value={buildCodeInput} onChange={(e) => setBuildCodeInput(e.target.value)} rows={2} />
          </label>
          <button type="button" onClick={() => loadBuildCode(unit.unitId, buildCodeInput)}>
            Carregar código
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
