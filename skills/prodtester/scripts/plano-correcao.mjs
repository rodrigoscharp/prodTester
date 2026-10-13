#!/usr/bin/env node
// Monta o plano de correção priorizado a partir do achados.json.
//
// Uso:
//   node plano-correcao.mjs <pasta-execucao>
//
// Calcula a prioridade de cada achado pela regra de diagnostico-correcao.md,
// grava a prioridade de volta em achados.json, grava plano-correcao.json na
// ordem de execução e imprime o plano.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pasta = resolve(process.argv[2] ?? '.');
const arquivo = join(pasta, 'achados.json');
if (!existsSync(arquivo)) {
  console.error(`plano-correcao: ${arquivo} não existe`);
  process.exit(1);
}
const achados = JSON.parse(readFileSync(arquivo, 'utf8'));

const PESO_SEVERIDADE = { critica: 4, alta: 3, media: 2, baixa: 1 };
const ORDEM = ['critico', 'ganho-rapido', 'estrutural', 'melhoria'];
const TITULOS = {
  critico: 'Críticos: corrigir antes de qualquer outra coisa',
  'ganho-rapido': 'Ganhos rápidos: alto impacto, pouco esforço',
  estrutural: 'Estruturais: mudanças maiores, com paliativo imediato',
  melhoria: 'Melhorias',
};

function prioridade(a) {
  if (a.severidade === 'critica') return 'critico';
  const impacto = a.impacto ?? PESO_SEVERIDADE[a.severidade] ?? 1;
  const esforco = a.esforco ?? 3;
  if (impacto >= 3 && esforco <= 2) return 'ganho-rapido';
  if (esforco >= 4) return 'estrutural';
  return 'melhoria';
}

const pendencias = [];
for (const a of achados) {
  a.prioridade = prioridade(a);
  if (a.impacto == null) pendencias.push(`${a.id}: sem impacto (usei a severidade)`);
  if (a.esforco == null) pendencias.push(`${a.id}: sem esforço (usei 3)`);
  if (!a.correcao) pendencias.push(`${a.id}: sem correção proposta`);
  if (!a.causa_raiz) pendencias.push(`${a.id}: sem causa raiz`);
}
writeFileSync(arquivo, `${JSON.stringify(achados, null, 2)}\n`);

const chave = (a) => [
  ORDEM.indexOf(a.prioridade),
  -(PESO_SEVERIDADE[a.severidade] ?? 0),
  -(a.impacto ?? 0),
  a.esforco ?? 3,
];
const ordenados = [...achados].sort((x, y) => {
  const a = chave(x);
  const b = chave(y);
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return String(x.id).localeCompare(String(y.id));
});

const plano = {
  gerado_em: new Date().toISOString(),
  grupos: ORDEM.map((p) => ({
    prioridade: p,
    titulo: TITULOS[p],
    itens: ordenados
      .filter((a) => a.prioridade === p)
      .map((a) => ({
        id: a.id,
        titulo: a.titulo,
        severidade: a.severidade,
        camada: a.camada ?? null,
        impacto: a.impacto ?? null,
        esforco: a.esforco ?? null,
        causa: a.causa_raiz?.status ?? null,
        correcao: a.correcao?.resumo ?? null,
        diff: a.correcao?.diff ?? null,
        revalidar_com: a.correcao?.teste ?? null,
      })),
  })).filter((g) => g.itens.length),
  pendencias,
};
writeFileSync(join(pasta, 'plano-correcao.json'), `${JSON.stringify(plano, null, 2)}\n`);

console.log('\nPlano de correção\n');
let n = 0;
for (const g of plano.grupos) {
  console.log(`${g.titulo}`);
  for (const i of g.itens) {
    n += 1;
    const causa = i.causa === 'confirmada' ? 'causa confirmada' : i.causa === 'hipotese' ? 'causa provável' : 'causa a investigar';
    console.log(`  ${String(n).padStart(2)}. [${i.id}] ${i.titulo}`);
    console.log(`      ${i.camada ?? '?'} · ${causa} · impacto ${i.impacto ?? '?'} · esforço ${i.esforco ?? '?'}${i.correcao ? ` · ${i.correcao}` : ''}`);
  }
  console.log('');
}
if (pendencias.length) {
  console.log('Pendências:');
  for (const p of pendencias) console.log(`  - ${p}`);
  console.log('');
}
