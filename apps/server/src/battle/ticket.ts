import crypto from 'node:crypto';

// M13, sub-sessão 2/N — o "ticket de batalha", a peça que faltava pro cliente conseguir
// JOGAR uma partida de PvP em vez de submeter comandos às cegas.
//
// O problema: §9.1 diz que "o atacante joga a camada de grid manualmente contra essa
// defesa", mas `POST /battles` (M7) recebe os comandos JÁ prontos e só então sorteia a
// seed. Sem saber a seed nem ter o `BattleSetup` montado, o cliente não tinha como
// simular a partida antes de enviar — os duelos que ele mostrasse não seriam os que o
// servidor resolveria.
//
// A saída, decidida com o usuário: o servidor emite um ticket ANTES da partida, com o
// setup montado e a seed. §9.4 continua valendo ao pé da letra — "zero RNG no cliente:
// seed vem do servidor" —, ela só passa a vir mais cedo.
//
// A seed é DERIVADA do nonce por HMAC com um segredo do servidor, não guardada. Duas
// consequências que importam:
//
// 1. Não exige tabela nem migração pro ticket: `POST /battles` recomputa a mesma seed a
//    partir do nonce que o cliente devolve. O nonce já era obrigatório e já era a chave
//    do replay persistido (defesa anti-reenvio de M7), então ele passa a valer como o
//    ticket em si.
// 2. O cliente não consegue escolher a própria seed: sem o segredo, não dá pra procurar
//    um nonce que produza uma seed favorável. O que ele PODE fazer é pedir vários tickets
//    e ficar com o melhor — grinding de seed é risco residual, e o que o contém é o rate
//    limiter (§9.4), que a emissão de ticket consome igual à batalha. Registrado em
//    DECISIONS.md.

// `crypto` (não `Math.random`) porque isto é infraestrutura em apps/server, não simulação
// de regra em packages/core — mesma leitura já registrada em `battle/routes.ts`.
export function generateNonce(): string {
  return crypto.randomUUID();
}

// uint32, a mesma largura que `rngFor` consome como seed de batalha.
export function deriveSeed(secret: string, nonce: string): number {
  const digest = crypto.createHmac('sha256', secret).update(nonce).digest();
  return digest.readUInt32BE(0);
}
