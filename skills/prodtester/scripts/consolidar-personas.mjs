#!/usr/bin/env node
// Consolida o resultado da etapa de personas de uma execução.
//
// Uso:
//   node consolidar-personas.mjs <pasta-execucao>
//
// Lê   personas/*/requisicoes.json, personas/*/resumo.json e personas/*/persona.md
// Grava requisicoes.json (uma entrada por método + rota) e matriz.json (fluxo × persona)
// e imprime a matriz no terminal.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SIMBOLOS = {
  concluiu: '✅',
  concluiu_com_problemas: '⚠️',
  falhou: '❌',
  abandonou: '❌',
  nao_executado: '—',
};

function lerJson(arquivo, padrao) {
  if (!existsSync(arquivo)) return padrao;
  try {
    return JSON.parse(readFileSync(arquivo, 'utf8'));
  } catch (erro) {
    console.error(`consolidar: ignorando ${arquivo} (JSON inválido: ${erro.message})`);
    return padrao;
  }
}

function lerCabecalho(arquivo) {
  if (!existsSync(arquivo)) return {};
  const bloco = readFileSync(arquivo, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!bloco) return {};
  return Object.fromEntries(
    bloco[1]
      .split('\n')
      .map((linha) => linha.match(/^([a-z_]+):\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim()]),
  );
}

// Troca identificadores por parâmetros: /api/produtos/42 vira /api/produtos/:id.
function normalizarRota(rota) {
  let caminho = String(rota ?? '');
  try {
    if (/^https?:\/\//.test(caminho)) caminho = new URL(caminho).pathname;
  } catch {
    /* mantém como veio */
  }
  caminho = caminho.split('?')[0];
  return caminho
    .split('/')
    .map((parte) => {
      if (/^\d+$/.test(parte)) return ':id';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parte)) return ':id';
      if (/^[0-9a-f]{24}$/i.test(parte)) return ':id';
      return parte;
    })
    .join('/');
}

function mediana(valores) {
  if (!valores.length) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

const pasta = resolve(process.argv[2] ?? '.');
const pastaPersonas = join(pasta, 'personas');
if (!existsSync(pastaPersonas)) {
  console.error(`consolidar: ${pastaPersonas} não existe`);
  process.exit(1);
}

const ids = readdirSync(pastaPersonas, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const personas = [];
const porRota = new Map();
const celulas = {};
const fluxos = new Map();

for (const id of ids) {
  const dir = join(pastaPersonas, id);
  const cab = lerCabecalho(join(dir, 'persona.md'));
  personas.push({ id, nome: cab.nome ?? id, emoji: cab.emoji ?? '🙂', cor: cab.cor ?? 'white' });

  for (const r of lerJson(join(dir, 'requisicoes.json'), [])) {
    const metodo = String(r.metodo ?? 'GET').toUpperCase();
    const rota = normalizarRota(r.rota ?? r.url_exemplo);
    const chave = `${metodo} ${rota}`;
    if (!porRota.has(chave)) {
      porRota.set(chave, {
        metodo,
        rota,
        ocorrencias: 0,
        status_vistos: [],
        tempos_ms: [],
        fluxos: [],
        personas: [],
        autenticacao: r.autenticacao ?? null,
        tipo_conteudo: r.tipo_conteudo ?? null,
        url_exemplo: r.url_exemplo ?? null,
        payload_exemplo: r.payload_exemplo ?? null,
      });
    }
    const e = porRota.get(chave);
    e.ocorrencias += 1;
    if (r.status != null && !e.status_vistos.includes(r.status)) e.status_vistos.push(r.status);
    if (typeof r.tempo_ms === 'number') e.tempos_ms.push(r.tempo_ms);
    if (r.fluxo && !e.fluxos.includes(r.fluxo)) e.fluxos.push(r.fluxo);
    if (!e.personas.includes(id)) e.personas.push(id);
    const tamanho = (v) => (v == null ? 0 : JSON.stringify(v).length);
    if (tamanho(r.payload_exemplo) > tamanho(e.payload_exemplo)) e.payload_exemplo = r.payload_exemplo;
  }

  const resumo = lerJson(join(dir, 'resumo.json'), { fluxos: [] });
  for (const f of resumo.fluxos ?? []) {
    if (!fluxos.has(f.fluxo)) fluxos.set(f.fluxo, { id: f.fluxo, nome: f.nome ?? f.fluxo });
    celulas[f.fluxo] ??= {};
    celulas[f.fluxo][id] = {
      resultado: f.resultado ?? 'nao_executado',
      passos: f.passos ?? null,
      motivo: f.motivo ?? null,
      achados: f.achados ?? [],
    };
  }
}

// Nomes dos fluxos vêm do contexto, quando existir.
const contexto = lerJson(join(pasta, 'contexto.json'), {});
for (const f of contexto.fluxos ?? []) {
  if (fluxos.has(f.id)) fluxos.get(f.id).nome = f.nome ?? f.id;
  else fluxos.set(f.id, { id: f.id, nome: f.nome ?? f.id });
}

const requisicoes = [...porRota.values()]
  .map(({ tempos_ms, ...e }) => ({
    ...e,
    status_vistos: e.status_vistos.sort(),
    tempo_ms: tempos_ms.length
      ? { min: Math.min(...tempos_ms), mediana: mediana(tempos_ms), max: Math.max(...tempos_ms), amostras: tempos_ms.length }
      : null,
  }))
  .sort((a, b) => a.rota.localeCompare(b.rota) || a.metodo.localeCompare(b.metodo));

const matriz = { fluxos: [...fluxos.values()], personas, celulas };

writeFileSync(join(pasta, 'requisicoes.json'), `${JSON.stringify(requisicoes, null, 2)}\n`);
writeFileSync(join(pasta, 'matriz.json'), `${JSON.stringify(matriz, null, 2)}\n`);

// Saída para o terminal.
const largura = Math.max(6, ...matriz.fluxos.map((f) => f.nome.length));
console.log(`\nMatriz fluxo × persona\n`);
console.log(`${''.padEnd(largura)}  ${personas.map((p) => `${p.emoji} ${p.nome}`.padEnd(16)).join('')}`);
for (const f of matriz.fluxos) {
  const linha = personas
    .map((p) => {
      const c = celulas[f.id]?.[p.id];
      const texto = c ? `${SIMBOLOS[c.resultado] ?? '?'} ${c.passos ?? '-'} passos` : '— não rodou';
      return texto.padEnd(16);
    })
    .join('');
  console.log(`${f.nome.padEnd(largura)}  ${linha}`);
}
console.log(`\nRequisições de API capturadas: ${requisicoes.length} rotas`);
for (const r of requisicoes) {
  const tempo = r.tempo_ms ? `${r.tempo_ms.mediana} ms (máx. ${r.tempo_ms.max} ms)` : 'sem tempo';
  console.log(`  ${r.metodo.padEnd(6)} ${r.rota.padEnd(32)} status ${r.status_vistos.join('/') || '?'}  ${tempo}`);
}
console.log('');
