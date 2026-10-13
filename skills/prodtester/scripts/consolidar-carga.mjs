#!/usr/bin/env node
// Consolida os resultados de carga de uma execução.
//
// Uso:
//   node consolidar-carga.mjs <pasta-execucao>
//
// Lê   carga/<etapa>*.json e carga/maquina-<etapa>*.json
// Grava carga/consolidado.json com a curva usuários × p95 × erro, a capacidade
// medida, o ponto de quebra, as disputas, os volumes e os alertas de validade.
// A capacidade é sempre um degrau que foi medido; nada é extrapolado.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const pasta = resolve(process.argv[2] ?? '.');
const dir = join(pasta, 'carga');
if (!existsSync(dir)) {
  console.error(`consolidar-carga: ${dir} não existe. Rode alguma etapa de carga antes.`);
  process.exit(1);
}

const ler = (arquivo) => JSON.parse(readFileSync(join(dir, arquivo), 'utf8'));
const arquivos = readdirSync(dir).filter((a) => a.endsWith('.json') && a !== 'consolidado.json');
const resultados = arquivos.filter((a) => !a.startsWith('maquina-')).map((a) => ({ arquivo: a, ...ler(a) }));
const maquinas = Object.fromEntries(arquivos.filter((a) => a.startsWith('maquina-')).map((a) => [a.replace(/^maquina-/, ''), ler(a)]));

const ORDEM = ['smoke', 'esperada', 'estresse', 'pico', 'resistencia', 'responsividade', 'disputa'];
resultados.sort((a, b) => ORDEM.indexOf(a.etapa) - ORDEM.indexOf(b.etapa) || a.arquivo.localeCompare(b.arquivo));

const alertas = [];
const etapas = resultados.map((r) => {
  const maquina = maquinas[r.arquivo] ?? null;
  if (maquina?.gerador_saturado) {
    alertas.push(`Na etapa ${r.etapa}, o k6 passou ${maquina.segundos_k6_acima_90_pct} s acima de 90% da CPU disponível: o gerador saturou e os números dessa etapa não valem. Use uma máquina maior ou k6 distribuído/na nuvem.`);
  } else if (maquina?.maquina_saturada) {
    alertas.push(`Na etapa ${r.etapa}, a máquina inteira passou ${maquina.segundos_maquina_acima_90_pct} s acima de 90% de CPU (o k6 sozinho chegou a ${maquina.k6_cpu_max_pct ?? '?'}%). Se o sistema auditado roda na mesma máquina, os dois disputam CPU e a capacidade medida fica abaixo da real.`);
  } else if (maquina && !maquina.k6_medido) {
    alertas.push(`Na etapa ${r.etapa}, não foi possível medir a CPU do k6; a validade do gerador não foi verificada.`);
  }
  if (maquina?.rede?.saturada) {
    alertas.push(`Na etapa ${r.etapa}, a rede do gerador chegou a ${maquina.rede.max_mbps} Mbit/s, 80% ou mais dos ${maquina.rede.capacidade_mbps} Mbit/s informados: a rede pode ter limitado a carga, e a capacidade medida pode ficar abaixo da real.`);
  }
  if (r.erros_contas?.length) alertas.push(`Na etapa ${r.etapa}, contas sem login: ${r.erros_contas.join('; ')}.`);
  return {
    arquivo: r.arquivo,
    etapa: r.etapa,
    volume: r.volume ?? null,
    gerado_em: r.gerado_em,
    interrompido: r.interrompido,
    duracao_s: r.duracao_s,
    geral: r.geral,
    degraus: r.degraus,
    passos: r.passos,
    maquina: maquina
      ? {
          cpu_max_pct: maquina.cpu_max_pct,
          cpu_media_pct: maquina.cpu_media_pct,
          k6_cpu_max_pct: maquina.k6_cpu_max_pct,
          gerador_saturado: maquina.gerador_saturado,
          maquina_saturada: maquina.maquina_saturada,
          memoria_alvo_mb: maquina.memoria_alvo_mb,
          rede: maquina.rede ?? null,
        }
      : null,
  };
});

// Curva usuários × p95 × erro, só com degraus medidos de etapas com usuários simultâneos.
const pontos = new Map();
for (const e of etapas) {
  if (!['smoke', 'esperada', 'estresse', 'pico'].includes(e.etapa)) continue;
  const invalida = e.maquina?.gerador_saturado === true;
  for (const d of e.degraus ?? []) {
    if (!d.medido) continue;
    const atual = pontos.get(d.vus);
    if (!atual || e.etapa === 'estresse') {
      pontos.set(d.vus, { vus: d.vus, etapa: e.etapa, p95_ms: d.p95_ms, p50_ms: d.p50_ms, taxa_erro: d.taxa_erro, rps: d.rps, dentro_dos_limites: d.dentro_dos_limites, valido: !invalida });
    }
  }
}
const curva = [...pontos.values()].sort((a, b) => a.vus - b.vus);
const limites = resultados.find((r) => r.limites)?.limites ?? { p95_ms: 500, taxa_erro: 0.01 };

let capacidade = null;
let quebra = null;
for (const p of curva) {
  if (!p.valido) continue;
  if (p.dentro_dos_limites && !quebra) capacidade = p;
  else if (!p.dentro_dos_limites && !quebra) quebra = p;
}
const motivoQuebra = (p) => {
  if (!p) return null;
  const motivos = [];
  if (p.p95_ms >= limites.p95_ms) motivos.push(`p95 de ${Math.round(p.p95_ms)} ms (limite ${limites.p95_ms} ms)`);
  if (p.taxa_erro >= limites.taxa_erro) motivos.push(`erro de ${(p.taxa_erro * 100).toFixed(2)}% (limite ${(limites.taxa_erro * 100).toFixed(2)}%)`);
  return motivos.join(' e ');
};

const estresse = etapas.find((e) => e.etapa === 'estresse');
const acimaDoTestado = Boolean(capacidade && !quebra);
if (acimaDoTestado) {
  alertas.push(`O sistema ficou dentro dos limites em todos os degraus medidos: o ponto de quebra está acima de ${capacidade.vus} usuários, o maior degrau testado.`);
}
if (curva.some((p) => !p.valido)) alertas.push('Degraus medidos com o gerador saturado foram excluídos do cálculo de capacidade.');

const disputas = resultados.filter((r) => r.disputa).map((r) => r.disputa);

const volumes = etapas
  .filter((e) => e.etapa === 'responsividade')
  .sort((a, b) => String(a.gerado_em).localeCompare(String(b.gerado_em)))
  .map((e) => ({ volume: e.volume, p95_ms: e.geral.p95_ms, taxa_erro: e.geral.taxa_erro, passos: e.passos, memoria_alvo_mb: e.maquina?.memoria_alvo_mb ?? null }));

// Resistência: desempenho estável e memória do sistema ao longo da etapa.
// A memória compara a média do segundo quarto (depois do aquecimento) com a
// do último quarto; crescer mais de 20% sem voltar é sinal de vazamento.
const resistencia = (() => {
  const r = resultados.find((x) => x.etapa === 'resistencia');
  if (!r) return null;
  const amostras = (maquinas[r.arquivo]?.amostras ?? []).map((a) => a.memoria_alvo_mb).filter((v) => typeof v === 'number');
  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const q = Math.floor(amostras.length / 4);
  const depoisDoAquecimento = q >= 2 ? media(amostras.slice(q, 2 * q)) : null;
  const final = q >= 2 ? media(amostras.slice(3 * q)) : null;
  const crescimento = depoisDoAquecimento && final ? Math.round(((final - depoisDoAquecimento) / depoisDoAquecimento) * 100) : null;
  const dentro = r.geral.p95_ms < limites.p95_ms && r.geral.taxa_erro < limites.taxa_erro;
  if (crescimento !== null && crescimento > 20) alertas.push(`Na resistência, a memória do sistema cresceu ${crescimento}% entre o começo (depois do aquecimento) e o fim da etapa, sem voltar: investigue vazamento de memória.`);
  return {
    vus: r.geral.vus_max,
    duracao_s: r.duracao_s ?? maquinas[r.arquivo]?.duracao_s ?? null,
    p95_ms: r.geral.p95_ms,
    taxa_erro: r.geral.taxa_erro,
    dentro_dos_limites: dentro,
    memoria_mb: depoisDoAquecimento !== null ? { depois_do_aquecimento: Math.round(depoisDoAquecimento), fim: Math.round(final), crescimento_pct: crescimento } : null,
    memoria_crescendo: crescimento !== null ? crescimento > 20 : null,
  };
})();

// No local-first, a etapa mais pesada é a do último volume medido.
const etapaMaiorVolume = etapas.filter((e) => e.etapa === 'responsividade').sort((a, b) => String(a.gerado_em).localeCompare(String(b.gerado_em))).at(-1) ?? null;

const passoMaisLento = (e) => (e?.passos ?? []).filter((p) => p.p95_ms !== null).sort((a, b) => b.p95_ms - a.p95_ms).slice(0, 5);

const consolidado = {
  gerado_em: new Date().toISOString(),
  limites,
  capacidade: capacidade
    ? { usuarios: capacidade.vus, p95_ms: capacidade.p95_ms, taxa_erro: capacidade.taxa_erro, etapa: capacidade.etapa, medida: true, pelo_menos: acimaDoTestado }
    : null,
  ponto_de_quebra: quebra ? { usuarios: quebra.vus, p95_ms: quebra.p95_ms, taxa_erro: quebra.taxa_erro, etapa: quebra.etapa, motivo: motivoQuebra(quebra) } : null,
  curva,
  passos_mais_lentos: passoMaisLento(estresse ?? etapas.find((e) => e.etapa === 'esperada') ?? etapaMaiorVolume ?? etapas[0]),
  disputas,
  volumes,
  resistencia,
  etapas,
  alertas,
};
writeFileSync(join(dir, 'consolidado.json'), `${JSON.stringify(consolidado, null, 2)}\n`);

// Saída para o terminal.
if (curva.length) console.log('\nCarga · usuários × p95 × erro\n');
const maiorP95 = Math.max(limites.p95_ms * 2, ...curva.map((p) => p.p95_ms ?? 0));
for (const p of curva) {
  const barra = '█'.repeat(Math.max(1, Math.round(((p.p95_ms ?? 0) / maiorP95) * 30)));
  const marca = !p.valido ? '⚠️' : p.dentro_dos_limites ? '✅' : '❌';
  console.log(`${String(p.vus).padStart(6)} VUs  ${barra.padEnd(31)} p95 ${String(Math.round(p.p95_ms)).padStart(6)} ms  erro ${((p.taxa_erro ?? 0) * 100).toFixed(2).padStart(6)}%  ${marca}`);
}
console.log('');
if (consolidado.capacidade) {
  console.log(`Capacidade medida: ${consolidado.capacidade.pelo_menos ? 'pelo menos ' : '~'}${consolidado.capacidade.usuarios} usuários simultâneos com p95 < ${limites.p95_ms} ms e erro < ${(limites.taxa_erro * 100).toFixed(0)}%.`);
} else if (curva.length) {
  console.log(`Nenhum degrau medido ficou dentro dos limites (p95 < ${limites.p95_ms} ms e erro < ${(limites.taxa_erro * 100).toFixed(0)}%).`);
}
if (consolidado.ponto_de_quebra) console.log(`Ponto de quebra: ${consolidado.ponto_de_quebra.usuarios} usuários (${consolidado.ponto_de_quebra.motivo}).`);
for (const d of disputas) {
  const veredito = d.passou === true ? '✅' : d.passou === false ? `❌ ${d.violacoes.join('; ')}` : `⏸ inconclusiva: ${(d.inconclusiva ?? []).join('; ')}`;
  console.log(`Disputa ${d.id}: ${d.sucessos} sucessos, verificação ${d.verificacao_antes} → ${d.verificacao_depois} ${veredito}`);
}
if (resistencia) {
  const mem = resistencia.memoria_mb ? `, memória ${resistencia.memoria_mb.depois_do_aquecimento} → ${resistencia.memoria_mb.fim} MB (${resistencia.memoria_mb.crescimento_pct >= 0 ? '+' : ''}${resistencia.memoria_mb.crescimento_pct}%)` : ', memória não medida';
  console.log(`Resistência: ${resistencia.vus} usuários por ${Math.round((resistencia.duracao_s ?? 0) / 60)} min, p95 ${Math.round(resistencia.p95_ms)} ms, erro ${((resistencia.taxa_erro ?? 0) * 100).toFixed(2)}%${mem} ${resistencia.dentro_dos_limites && !resistencia.memoria_crescendo ? '✅' : '❌'}`);
}
for (const v of volumes) console.log(`Volume ${v.volume}: p95 ${Math.round(v.p95_ms)} ms, erro ${((v.taxa_erro ?? 0) * 100).toFixed(2)}%`);
if (consolidado.passos_mais_lentos.length) {
  console.log('\nPassos mais lentos:');
  for (const p of consolidado.passos_mais_lentos) console.log(`  ${p.passo.padEnd(30)} p95 ${Math.round(p.p95_ms)} ms  erro ${((p.taxa_erro ?? 0) * 100).toFixed(2)}%`);
}
for (const a of alertas) console.log(`\n⚠️  ${a}`);
console.log('');
