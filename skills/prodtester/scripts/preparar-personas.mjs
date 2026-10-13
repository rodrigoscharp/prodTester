#!/usr/bin/env node
// Prepara as pastas das personas de uma execução.
//
// Uso:
//   node preparar-personas.mjs <pasta-execucao> <id> [<id> ...]
//
// Para cada id, cria personas/<id>/screenshots e copia o arquivo da persona
// padrão (personas/<id>.md desta skill) para personas/<id>/persona.md.
// Personas personalizadas não são copiadas: o orquestrador escreve o
// persona.md delas, e este script só cria a pasta.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [pastaArg, ...ids] = process.argv.slice(2);
if (!pastaArg || ids.length === 0) {
  console.error('uso: node preparar-personas.mjs <pasta-execucao> <id> [<id> ...]');
  process.exit(1);
}

const execucao = resolve(pastaArg);
const personasDaSkill = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'personas');

for (const id of ids) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    console.error(`preparar: id inválido "${id}"`);
    process.exit(1);
  }
  const pasta = join(execucao, 'personas', id);
  mkdirSync(join(pasta, 'screenshots'), { recursive: true });
  const padrao = join(personasDaSkill, `${id}.md`);
  const destino = join(pasta, 'persona.md');
  if (existsSync(padrao)) {
    copyFileSync(padrao, destino);
    console.log(`${id}: pasta pronta, persona padrão copiada`);
  } else if (existsSync(destino)) {
    console.log(`${id}: pasta pronta, persona personalizada já existe`);
  } else {
    console.log(`${id}: pasta pronta; escreva ${destino} antes de disparar a persona`);
  }
}
