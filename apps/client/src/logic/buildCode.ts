import {
  validateColumnAllocation,
  type ColumnTalentTree,
  type Id,
  type TalentAllocation,
} from '@paths-beyond/core';

// §11 — "Talentos: ... string de build compartilhável."
//
// §8.2 (M17, 4/N) — o código passou a ser de um PERSONAGEM, e não de uma classe. Enquanto a
// árvore era da classe, `classId` bastava para saber onde a alocação encaixava; com a árvore
// sendo do personagem (D6), duas pessoas da mesma classe têm árvores diferentes e o `classId`
// deixou de identificar coisa alguma.
//
// Os códigos gravados na forma antiga quebram, e isso é D5 do briefing e não um descuido:
// "não há caminho de migração: o formato de alocação muda". Um código antigo decodifica para
// um objeto sem `characterId` e é recusado por `decodeBuildCode`.

export interface BuildCode {
  readonly characterId: Id;
  readonly talents: TalentAllocation;
}

export function encodeBuildCode(build: BuildCode): string {
  return btoa(encodeURIComponent(JSON.stringify(build)));
}

export function decodeBuildCode(code: string): BuildCode | null {
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(atob(code.trim())));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'characterId' in parsed &&
      'talents' in parsed &&
      typeof (parsed as { characterId: unknown }).characterId === 'string' &&
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

export type BuildCodeRead =
  | { readonly ok: true; readonly talents: TalentAllocation }
  | { readonly ok: false; readonly reason: string };

// Ler um código para um personagem específico é três perguntas, e as três precisam ser feitas
// antes de a build entrar na tela:
//
//   1. o texto é um código? (lixo colado da área de transferência)
//   2. é o código DESTE personagem? — sem isto, a build de outro entraria inteira, todo nó
//      seria desconhecido e `resolveTalentEffects` os ignoraria em silêncio (§8.2): o jogador
//      colaria um código e ficaria com zero talento sem nenhum aviso;
//   3. a alocação é alcançável nesta árvore? — quem responde é o core, e não este arquivo.
export function readBuildCodeFor(
  characterId: Id,
  tree: ColumnTalentTree,
  code: string,
  awakening?: number,
): BuildCodeRead {
  const decoded = decodeBuildCode(code);
  if (!decoded) return { ok: false, reason: 'código de build inválido' };

  if (decoded.characterId !== characterId) {
    return { ok: false, reason: `este código é de ${decoded.characterId}, e a árvore aberta é de ${characterId}` };
  }

  const resultado = validateColumnAllocation({ tree, allocation: decoded.talents, awakening });
  if (!resultado.valid) {
    return { ok: false, reason: resultado.issues[0]?.reason ?? 'build do código é inválida' };
  }

  return { ok: true, talents: decoded.talents };
}
