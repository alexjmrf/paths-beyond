#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Regra 1 e regra 2 valem para `packages/core`; D15 (M18) põe `packages/gacha` sob as
// mesmas — "as mesmas regras do core, fora dele". Se a trava não o alcançasse, a regra
// valeria lá só por disciplina, que é o que ela existe para não depender.
const DEFAULT_TARGETS = ['packages/core/src', 'packages/gacha/src'];
const TARGET_DIRS = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_TARGETS;
const PATTERN = /Math\.random/;

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) results.push(full);
  }
  return results;
}

const violations = [];
for (const file of TARGET_DIRS.flatMap(walk)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line)) violations.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('BLOQUEADO: Math.random encontrado em um pacote de regra:');
  violations.forEach((v) => console.error('  ' + v));
  process.exit(1);
}
console.log(`OK: nenhum Math.random em ${TARGET_DIRS.join(', ')}.`);
process.exit(0);
