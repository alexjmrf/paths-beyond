// M34 2/N (D45) — a DECLARAÇÃO da telemetria, traduzida.
//
// A lista do que é coletado vem do servidor (`GET /me/telemetry` → `collected`), que a trava
// contra as próprias tabelas. A tela não tem a lista escrita: ela traduz o que chega. Esta
// constante existe só para o teste afirmar que cada campo que o servidor declara HOJE tem nome
// nas duas línguas — se o servidor passar a declarar um campo novo, ele aparece pelo nome cru
// (visível, e o teste da declaração reprova até ganhar tradução), nunca some.

export const CAMPOS_DA_TELEMETRIA = ['missionId', 'issuedAt', 'finishedAt', 'outcome', 'rounds', 'lastSeenAt'] as const;

export function rotuloDoCampo(t: (chave: string) => string, campo: string): string {
  const chave = `app.pref.telemetriaCampo.${campo}`;
  const traduzido = t(chave);
  return traduzido === chave ? campo : traduzido;
}
