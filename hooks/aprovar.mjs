#!/usr/bin/env node
// Hook PreToolUse do prodtester.
//
// Aprova sem perguntar apenas quatro coisas, para a auditoria rodar sem uma
// fila de pedidos de permissão:
//   1. ferramentas dos navegadores do próprio prodtester (servidores pw-*),
//      exceto as que executam código arbitrário ou enviam arquivos locais;
//   2. o comando simples `node <plugin>/skills/prodtester/scripts/<script>.mjs ...`
//      para os scripts listados em SCRIPTS, sem encadeamento, redirecionamento
//      ou expansão de shell;
//   3. a leitura (Read) de arquivos dentro da pasta do próprio plugin, onde
//      ficam as personas, o protocolo e as referências;
//   4. a gravação (Write e Edit) de arquivos dentro de <projeto>/auditoria/,
//      a pasta de dados da auditoria.
// Qualquer outra chamada segue o fluxo normal de permissões do Claude Code.

import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, relative, resolve, isAbsolute } from 'node:path';

const NAVEGADOR = /^mcp__plugin_prodtester_pw-(cida|leo|jessica|marcos|kaio|extra-1|extra-2)__browser_[a-z_]+$/;
const NAVEGADOR_EXCLUIDAS = new Set(['browser_run_code_unsafe', 'browser_file_upload']);
// Scripts do plugin que só leem e escrevem dentro da pasta da auditoria.
const SCRIPTS = ['conferir-correcoes.mjs', 'registrar.mjs', 'preparar-personas.mjs', 'consolidar-personas.mjs', 'consolidar-api.mjs', 'consolidar-carga.mjs', 'preparar-testes.mjs', 'plano-correcao.mjs', 'comparar-revalidacao.mjs', 'gerar-relatorio.mjs', 'validar.mjs'];

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

// Caminho real de um arquivo que talvez ainda não exista: resolve o ancestral
// mais próximo que existe (seguindo links simbólicos) e junta o resto.
function caminhoRealFuturo(caminho) {
  let base = resolve(caminho);
  const resto = [];
  for (;;) {
    try {
      return resolve(realpathSync(base), ...resto.reverse());
    } catch {
      const pai = dirname(base);
      if (pai === base) return resolve(caminho);
      resto.push(basename(base));
      base = pai;
    }
  }
}

function dentroDe(pasta, arquivo) {
  const r = relative(pasta, arquivo);
  return Boolean(r) && !r.startsWith('..') && !isAbsolute(r);
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
    if (dentroDe(caminhoReal(process.env.CLAUDE_PLUGIN_ROOT), caminhoReal(arquivo))) aprovar('Leitura de arquivo do próprio prodtester');
  }
}

if ((ferramenta === 'Write' || ferramenta === 'Edit') && process.env.CLAUDE_PROJECT_DIR) {
  const arquivo = String(entrada.tool_input?.file_path ?? '');
  if (isAbsolute(arquivo)) {
    const auditoria = resolve(caminhoReal(process.env.CLAUDE_PROJECT_DIR), 'auditoria');
    if (dentroDe(auditoria, caminhoRealFuturo(arquivo))) aprovar('Gravação na pasta auditoria/ do projeto');
  }
}

process.exit(0);
