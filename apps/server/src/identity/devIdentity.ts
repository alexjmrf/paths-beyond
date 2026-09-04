import type { IdentityValidator, PlatformIdentity } from './types.js';

// M20 — o validador de DESENVOLVIMENTO, para o `devServer` e para a suíte.
//
// Ele existe pelo mesmo motivo que os repositórios de memória existem desde M7: verificar o
// cliente e rodar teste não pode exigir a plataforma real. O formato é deliberadamente
// explícito — `dev:<id>` — para nenhum ticket de verdade ser confundido com um de mentira, e
// para uma configuração errada em produção falhar em vez de aceitar qualquer coisa.
//
// **Ele NUNCA é o padrão de `buildApp`.** Quem quer o validador de dev pede por ele; o
// `index.ts` de produção monta o da Steam. Um default permissivo aqui seria uma porta aberta
// que ninguém veria.
const PREFIXO = 'dev:';

export function createDevIdentityValidator(): IdentityValidator {
  return {
    async validate(ticket: string): Promise<PlatformIdentity | null> {
      if (!ticket.startsWith(PREFIXO)) return null;
      const platformId = ticket.slice(PREFIXO.length).trim();
      if (platformId.length === 0) return null;

      return { provider: 'dev', platformId };
    },
  };
}
