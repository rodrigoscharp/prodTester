#!/usr/bin/env node
// Hook PreToolUse do prodtester.
//
// Aprova sem perguntar apenas duas coisas, para as personas rodarem em
// paralelo sem interrupção:
//   1. ferramentas dos navegadores do próprio prodtester (servidores pw-*),
//      exceto as que executam código arbitrário ou enviam arquivos locais;
//   2. o comando simples `node <plugin>/skills/prodtester/scripts/<script>.mjs ...`
//      para os scripts listados em SCRIPTS, sem encadeamento, redirecionamento
//      ou expansão de shell;
//   3. a leitura (Read) de arquivos dentro da pasta do próprio plugin, onde
//      ficam as personas, o protocolo e as referências.
// Qualquer outra chamada segue o fluxo normal de permissões do Claude Code.

import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve, isAbsolute } from 'node:path';

const NAVEGADOR = /^mcp__plugin_prodtester_pw-(cida|leo|jessica|marcos|kaio|extra-1|extra-2)__browser_[a-z_]+$/;
const NAVEGADOR_EXCLUIDAS = new Set(['browser_run_code_unsafe', 'browser_file_upload']);
// Scripts do plugin que só leem e escrevem dentro da pasta da auditoria.
const SCRIPTS = ['registrar.mjs', 'preparar-personas.mjs', 'consolidar-personas.mjs', 'consolidar-api.mjs', 'consolidar-carga.mjs', 'preparar-testes.mjs', 'plano-correcao.mjs', 'comparar-revalidacao.mjs', 'validar.mjs'];

function aprovar(motivo) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: motivo,
      },
    }),
  );
  process.exit(0);
}

// Divide um comando em palavras, aceitando aspas simples e duplas.
// Devolve null se houver qualquer coisa além de palavras simples:
// operadores, redirecionamentos, substituições, variáveis ou quebras de linha.
function palavras(comando) {
  const resultado = [];
  let atual = '';
  let temPalavra = false;
  let aspas = null;
  for (const c of comando) {
    if (aspas === "'") {
      if (c === "'") aspas = null;
      else atual += c;
      continue;
    }
    if (aspas === '"') {
      if (c === '"') aspas = null;
      else if (c === '$' || c === '`' || c === '\\') return null;
      else atual += c;
      continue;
    }
    if (c === "'" || c === '"') {
      aspas = c;
      temPalavra = true;
    } else if (c === ' ' || c === '\t') {
      if (temPalavra) resultado.push(atual);
      atual = '';
      temPalavra = false;
    } else if (';&|<>`$()\\\n\r*?[]{}~#!'.includes(c)) {
      return null;
    } else {
      atual += c;
      temPalavra = true;
    }
  }
  if (aspas) return null;
  if (temPalavra) resultado.push(atual);
  return resultado;
}

function caminhoReal(caminho) {
  try {
    return realpathSync(caminho);
  } catch {
    return resolve(caminho);
  }
}

let entrada;
try {
  entrada = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const ferramenta = entrada.tool_name ?? '';

const navegador = ferramenta.match(NAVEGADOR);
if (navegador) {
  const nome = ferramenta.split('__').pop();
  if (!NAVEGADOR_EXCLUIDAS.has(nome)) aprovar('Navegador de persona do prodtester');
  process.exit(0);
}

if (ferramenta === 'Bash' && process.env.CLAUDE_PLUGIN_ROOT) {
  const partes = palavras(String(entrada.tool_input?.command ?? '').trim());
  if (partes && partes.length >= 3 && partes[0] === 'node') {
    const pastaScripts = caminhoReal(resolve(process.env.CLAUDE_PLUGIN_ROOT, 'skills/prodtester/scripts'));
    const script = SCRIPTS.find((nome) => caminhoReal(partes[1]) === resolve(pastaScripts, nome));
    if (script) aprovar(`Script ${script} do prodtester`);
  }
}

if (ferramenta === 'Read' && process.env.CLAUDE_PLUGIN_ROOT) {
  const arquivo = String(entrada.tool_input?.file_path ?? '');
  if (isAbsolute(arquivo)) {
    const dentro = relative(caminhoReal(process.env.CLAUDE_PLUGIN_ROOT), caminhoReal(arquivo));
    if (dentro && !dentro.startsWith('..') && !isAbsolute(dentro)) aprovar('Leitura de arquivo do próprio prodtester');
  }
}

process.exit(0);
