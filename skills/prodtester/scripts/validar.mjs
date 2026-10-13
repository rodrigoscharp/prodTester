#!/usr/bin/env node
// Valida os dados de uma execução antes de gerar o relatório.
//
// Uso:
//   node validar.mjs <pasta-execucao>
//
// Confere o achados.json contra o formato de formato-dados.md e verifica se
// cada evidência que aponta para um arquivo existe de fato. Sai com código 1
// se houver erro, para que nada sem evidência chegue ao relatório.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ENUMS = {
  modo: ['personas', 'api', 'carga', 'volume', 'preparacao'],
  categoria: [
    'bug', 'ux', 'acessibilidade', 'mobile', 'mensagem-de-erro', 'validacao', 'autenticacao', 'isolamento',
    'idempotencia', 'disputa', 'limites', 'desempenho', 'escalabilidade', 'infra', 'robustez',
  ],
  severidade: ['critica', 'alta', 'media', 'baixa'],
  camada: ['codigo', 'banco', 'infra', 'arquitetura', 'conteudo'],
  prioridade: ['critico', 'ganho-rapido', 'estrutural', 'melhoria'],
  status_causa: ['confirmada', 'hipotese'],
  tipo_evidencia: ['screenshot', 'requisicao', 'k6', 'console', 'explain', 'log', 'codigo', 'passo', 'medicao'],
};
const TIPOS_COM_ARQUIVO = new Set(['screenshot', 'k6', 'explain', 'log']);

const pasta = resolve(process.argv[2] ?? '.');
const erros = [];
const avisos = [];

const arquivo = join(pasta, 'achados.json');
if (!existsSync(arquivo)) {
  console.log('validar: achados.json não existe ainda (nenhum achado registrado).');
  process.exit(0);
}

let achados;
try {
  achados = JSON.parse(readFileSync(arquivo, 'utf8'));
} catch (erro) {
  console.error(`validar: achados.json inválido: ${erro.message}`);
  process.exit(1);
}
if (!Array.isArray(achados)) {
  console.error('validar: achados.json precisa ser uma lista');
  process.exit(1);
}

const vistos = new Set();
for (const [i, a] of achados.entries()) {
  const nome = a?.id ?? `#${i + 1}`;
  const erro = (m) => erros.push(`${nome}: ${m}`);
  const aviso = (m) => avisos.push(`${nome}: ${m}`);

  if (!/^A-\d{3,}$/.test(a?.id ?? '')) erro('id precisa ter o formato A-001');
  if (vistos.has(a?.id)) erro('id repetido');
  vistos.add(a?.id);
  if (!a?.titulo) erro('sem título');
  for (const campo of ['modo', 'categoria', 'severidade']) {
    if (!ENUMS[campo].includes(a?.[campo])) erro(`${campo} inválido: ${JSON.stringify(a?.[campo])}`);
  }
  if (a?.camada != null && !ENUMS.camada.includes(a.camada)) erro(`camada inválida: ${JSON.stringify(a.camada)}`);
  if (a?.prioridade != null && !ENUMS.prioridade.includes(a.prioridade)) erro(`prioridade inválida: ${JSON.stringify(a.prioridade)}`);
  for (const campo of ['impacto', 'esforco']) {
    if (a?.[campo] != null && !(Number.isInteger(a[campo]) && a[campo] >= 1 && a[campo] <= 5)) erro(`${campo} precisa ser inteiro de 1 a 5`);
  }

  if (!Array.isArray(a?.evidencias) || a.evidencias.length === 0) {
    erro('sem evidência: todo achado precisa de pelo menos uma');
  } else {
    for (const ev of a.evidencias) {
      if (!ENUMS.tipo_evidencia.includes(ev?.tipo)) erro(`evidência com tipo inválido: ${JSON.stringify(ev?.tipo)}`);
      if (!ev?.ref && !ev?.resumo) erro('evidência sem ref nem resumo');
      if (TIPOS_COM_ARQUIVO.has(ev?.tipo) && ev?.ref) {
        const caminho = String(ev.ref).split('#')[0];
        if (!existsSync(join(pasta, caminho)) && !existsSync(resolve(caminho))) erro(`evidência aponta para arquivo inexistente: ${caminho}`);
      }
    }
  }

  if (a?.causa_raiz != null) {
    if (!ENUMS.status_causa.includes(a.causa_raiz.status)) erro('causa_raiz.status precisa ser "confirmada" ou "hipotese"');
    if (a.causa_raiz.status === 'confirmada' && !a.causa_raiz.evidencia) erro('causa confirmada sem campo evidencia');
  } else {
    aviso('sem causa raiz (preencher no diagnóstico)');
  }

  if (a?.correcao?.diff && !existsSync(join(pasta, a.correcao.diff))) erro(`diff inexistente: ${a.correcao.diff}`);
}

for (const a of avisos) console.log(`aviso  ${a}`);
for (const e of erros) console.log(`ERRO   ${e}`);
console.log(`\n${achados.length} achados · ${erros.length} erros · ${avisos.length} avisos`);
process.exit(erros.length ? 1 : 0);
