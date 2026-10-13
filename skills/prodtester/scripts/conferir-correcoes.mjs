#!/usr/bin/env node
// Confere se cada diff de <execucao>/correcoes/ aplica no estado atual do
// repositório auditado, com `git apply --check` (não altera nada).
//
// Uso:
//   node conferir-correcoes.mjs <pasta-execucao> [pasta-do-projeto]
//
// Sem a pasta do projeto, usa a que contém auditoria/<execucao>.
// Sai com código 1 se algum diff não aplicar.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [execucaoArg, projetoArg] = process.argv.slice(2);
if (!execucaoArg) {
  console.error('uso: node conferir-correcoes.mjs <pasta-execucao> [pasta-do-projeto]');
  process.exit(1);
}
const execucao = resolve(execucaoArg);
const projeto = resolve(projetoArg ?? join(execucao, '..', '..'));
const pasta = join(execucao, 'correcoes');
if (!existsSync(pasta)) {
  console.log('conferir-correcoes: nenhuma pasta correcoes/ nesta execução.');
  process.exit(0);
}

const diffs = readdirSync(pasta).filter((a) => a.endsWith('.diff')).sort();
let falhas = 0;
for (const diff of diffs) {
  try {
    execFileSync('git', ['-C', projeto, 'apply', '--check', join(pasta, diff)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`✔ ${diff} aplica`);
  } catch (erro) {
    falhas += 1;
    console.log(`✖ ${diff} não aplica: ${String(erro.stderr || erro.message).trim().split('\n')[0]}`);
  }
}
console.log(`\n${diffs.length} diffs · ${falhas} não aplicam`);
process.exit(falhas ? 1 : 0);
