import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ZodTypeAny } from 'zod';

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export interface ValidationFileError {
  file: string;
  issues: ValidationIssue[];
}

export interface ValidationReport {
  ok: boolean;
  filesChecked: number;
  errors: ValidationFileError[];
}

export interface DatasetReport extends ValidationReport {
  schemasFound: number;
}

export function findJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) results.push(...findJsonFiles(full));
    else if (entry.endsWith('.json')) results.push(full);
  }
  return results;
}

export function validateFiles(schema: ZodTypeAny, files: string[]): ValidationReport {
  const errors: ValidationFileError[] = [];
  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      errors.push({
        file,
        issues: parsed.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      });
    }
  }
  return { ok: errors.length === 0, filesChecked: files.length, errors };
}

async function loadContentSchema(schemaFile: string): Promise<ZodTypeAny> {
  // Node aceita file:// URLs com espaço literal (não percent-encoded) tão bem quanto
  // com %20 — mas o loader SSR do Vitest (vite-node) só resolve corretamente a forma
  // com espaço literal, então evitamos `%20` aqui em vez de usar `.href` puro.
  const schemaUrl = pathToFileURL(schemaFile).href.replace(/%20/g, ' ');
  const mod = (await import(schemaUrl)) as { default?: ZodTypeAny };
  if (!mod.default) {
    throw new Error(`${schemaFile} precisa exportar um schema Zod como default export.`);
  }
  return mod.default;
}

/**
 * Descobre tipos de conteúdo dinamicamente a partir de `rootDir/schemas/<tipo>.schema.ts`
 * e valida `rootDir/<tipo>/**\/*.json` contra o schema correspondente. Sem schemas, retorna
 * um relatório trivialmente `ok` — isso é esperado até M1+ popular `packages/data/schemas`.
 */
export async function validateDataset(rootDir: string): Promise<DatasetReport> {
  const schemasDir = join(rootDir, 'schemas');
  const schemaFiles = existsSync(schemasDir)
    ? readdirSync(schemasDir).filter((f) => f.endsWith('.schema.ts'))
    : [];

  let filesChecked = 0;
  const errors: ValidationFileError[] = [];

  for (const schemaFileName of schemaFiles) {
    const type = schemaFileName.replace(/\.schema\.ts$/, '');
    const schema = await loadContentSchema(join(schemasDir, schemaFileName));
    const files = findJsonFiles(join(rootDir, type));
    const report = validateFiles(schema, files);
    filesChecked += report.filesChecked;
    errors.push(...report.errors);
  }

  return { ok: errors.length === 0, schemasFound: schemaFiles.length, filesChecked, errors };
}

async function main() {
  // fileURLToPath decodifica corretamente % (ex.: espaço no diretório do projeto);
  // `.pathname` cru não decodifica e quebra paths com espaço.
  const rootDir = fileURLToPath(new URL('.', import.meta.url));
  const report = await validateDataset(rootDir);

  if (report.schemasFound === 0) {
    console.log('OK: 0 schemas em packages/data/schemas, 0 arquivos validados.');
  } else {
    console.log(`Schemas encontrados: ${report.schemasFound}. Arquivos validados: ${report.filesChecked}.`);
  }

  if (!report.ok) {
    console.error('Falhas de validação:');
    for (const err of report.errors) {
      console.error(`  ${err.file}`);
      for (const issue of err.issues) {
        console.error(`    - ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  }

  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
