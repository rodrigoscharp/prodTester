#!/usr/bin/env node
// Copia os executores k6 da skill para a pasta de testes de uma execução.
//
// Uso:
//   node preparar-testes.mjs <pasta-execucao> api|carga [...]
//
// Cria <execucao>/testes e <execucao>/<modo> e copia templates/<modo>.k6.js
// para <execucao>/testes/<modo>.k6.js, sem alterar o conteúdo.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODOS = ['api', 'carga'];
const [pastaArg, ...modos] = process.argv.slice(2);
if (!pastaArg || modos.length === 0) {
  console.error('uso: node preparar-testes.mjs <pasta-execucao> api|carga [...]');
  process.exit(1);
}

const execucao = resolve(pastaArg);
const templates = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates');
mkdirSync(join(execucao, 'testes'), { recursive: true });

for (const modo of modos) {
  if (!MODOS.includes(modo)) {
    console.error(`preparar-testes: modo inválido "${modo}". Use: ${MODOS.join(', ')}`);
    process.exit(1);
  }
  const origem = join(templates, `${modo}.k6.js`);
  if (!existsSync(origem)) {
    console.error(`preparar-testes: ${origem} não existe`);
    process.exit(1);
  }
  mkdirSync(join(execucao, modo), { recursive: true });
  copyFileSync(origem, join(execucao, 'testes', `${modo}.k6.js`));
  console.log(`${modo}: testes/${modo}.k6.js copiado e pasta ${modo}/ criada`);
}
