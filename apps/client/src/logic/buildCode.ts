import type { TalentAllocation } from '@paths-beyond/core';

export interface BuildCode {
  readonly classId: string;
  readonly talents: TalentAllocation;
}

// §11 — "Talentos: ... string de build compartilhável." Sem backend/persistência ainda
// (isso é M7+), então o "compartilhamento" é local: um base64 do JSON da alocação,
// decodificável por qualquer sessão do cliente sem round-trip de rede — cola o código,
// outra pessoa vê a mesma árvore.
export function encodeBuildCode(build: BuildCode): string {
  return btoa(encodeURIComponent(JSON.stringify(build)));
}

export function decodeBuildCode(code: string): BuildCode | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(atob(code.trim())));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'classId' in parsed &&
      'talents' in parsed &&
      typeof (parsed as { classId: unknown }).classId === 'string' &&
      typeof (parsed as { talents: unknown }).talents === 'object' &&
      (parsed as { talents: unknown }).talents !== null
    ) {
      return parsed as BuildCode;
    }
    return null;
  } catch {
    return null;
  }
}
