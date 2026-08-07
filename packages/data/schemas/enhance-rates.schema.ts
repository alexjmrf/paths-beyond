import { z } from 'zod';

// §7.3 — "Chance de sucesso decrescente (+0→+3 100%, ..., +9→+12 65%, +12→+15 40%)."
// Só 3 dos 5 números são dados pela spec; os dois do meio são número de balanceamento
// (regra de dados.md: nunca hardcoded), preenchidos aqui por quem autora o dado, não
// pelo motor — decisão registrada em DECISIONS.md.
const enhanceRatesSchema = z.object({
  toThree: z.number().int().min(0).max(1000),
  toSix: z.number().int().min(0).max(1000),
  toNine: z.number().int().min(0).max(1000),
  toTwelve: z.number().int().min(0).max(1000),
  toFifteen: z.number().int().min(0).max(1000),
});

export default enhanceRatesSchema;
