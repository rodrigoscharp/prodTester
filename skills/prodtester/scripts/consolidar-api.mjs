#!/usr/bin/env node
// Consolida o resultado dos testes de API de uma execução.
//
// Uso:
//   node consolidar-api.mjs <pasta-execucao>
//
// Lê   api/resultado.json (gravado por api.k6.js)
// Grava api/tabela.json (endpoint × tipo de check) e imprime a tabela e as falhas.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TIPOS = ['caminho_feliz', 'validacao', 'autenticacao', 'isolamento', 'idempotencia', 'limites'];
const ROTULOS = {
  caminho_feliz: 'feliz',
  validacao: 'validação',
  autenticacao: 'auth',
  isolamento: 'isolamento',
  idempotencia: 'idempot.',
  limites: 'limites',
};

const pasta = resolve(process.argv[2] ?? '.');
const arquivo = join(pasta, 'api', 'resultado.json');
if (!existsSync(arquivo)) {
  console.error(`consolidar-api: ${arquivo} não existe. Rode os testes de API antes.`);
  process.exit(1);
}
const resultado = JSON.parse(readFileSync(arquivo, 'utf8'));

const endpoints = new Map();
for (const caso of resultado.casos ?? []) {
  if (!endpoints.has(caso.endpoint)) endpoints.set(caso.endpoint, { endpoint: caso.endpoint, tipos: {}, tempo_max_ms: null, lento: false });
  const e = endpoints.get(caso.endpoint);
  const t = (e.tipos[caso.tipo] ??= { casos: 0, passaram: 0, falharam: 0, nao_executados: 0, ids: [] });
  t.casos += 1;
  t.ids.push(caso.id);
  if (caso.nao_executado) t.nao_executados += 1;
  else if (caso.passou) t.passaram += 1;
  else t.falharam += 1;
  const tempo = caso.obtido?.tempo_ms;
  if (typeof tempo === 'number' && (e.tempo_max_ms === null || tempo > e.tempo_max_ms)) e.tempo_max_ms = tempo;
  if (caso.lento) e.lento = true;
}

const simbolo = (t) => {
  if (!t) return '—';
  if (t.falharam > 0) return '❌';
  if (t.nao_executados > 0 && t.passaram === 0) return '⏸';
  return '✅';
};

const tabela = {
  gerado_em: new Date().toISOString(),
  tipos: TIPOS,
  endpoints: [...endpoints.values()].map((e) => ({
    ...e,
    celulas: Object.fromEntries(TIPOS.map((tipo) => [tipo, simbolo(e.tipos[tipo])])),
  })),
  resumo: resultado.resumo,
};
writeFileSync(join(pasta, 'api', 'tabela.json'), `${JSON.stringify(tabela, null, 2)}\n`);

const largura = Math.max(10, ...tabela.endpoints.map((e) => e.endpoint.length));
console.log('\nTestes de API · endpoint × check\n');
console.log(`${'endpoint'.padEnd(largura)}  ${TIPOS.map((t) => ROTULOS[t].padEnd(11)).join('')}tempo máx.`);
for (const e of tabela.endpoints) {
  const tempo = e.tempo_max_ms === null ? '-' : `${e.tempo_max_ms} ms${e.lento ? ' ⏱' : ''}`;
  console.log(`${e.endpoint.padEnd(largura)}  ${TIPOS.map((t) => e.celulas[t].padEnd(11)).join('')}${tempo}`);
}

const falhas = (resultado.casos ?? []).filter((c) => !c.passou);
if (Object.keys(resultado.erros_contas ?? {}).length) {
  console.log('\nContas que não puderam ser usadas:');
  for (const [conta, erro] of Object.entries(resultado.erros_contas)) console.log(`  ${conta}: ${erro}`);
}
if (falhas.length) {
  console.log('\nFalhas:');
  for (const c of falhas) {
    const status = c.obtido ? `status ${c.obtido.status}, ${c.obtido.tempo_ms} ms` : 'não executado';
    console.log(`  ${c.id} ${c.endpoint} [${c.tipo}] ${status} — ${c.falhas.join('; ')}`);
  }
}
const r = resultado.resumo ?? {};
console.log(`\n${r.passaram ?? 0}/${r.casos ?? 0} casos passaram · ${r.falharam ?? 0} falharam · ${r.nao_executados ?? 0} não executados · ${r.lentos ?? 0} lentos\n`);
