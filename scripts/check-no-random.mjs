#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_DIR = process.argv[2] ?? 'packages/core/src';
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
for (const file of walk(TARGET_DIR)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (PATTERN.test(line)) violations.push(`${file}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('BLOQUEADO: Math.random encontrado em packages/core:');
  violations.forEach((v) => console.error('  ' + v));
  process.exit(1);
}
console.log(`OK: nenhum Math.random em ${TARGET_DIR}.`);
process.exit(0);
