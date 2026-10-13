#!/usr/bin/env node
// Compara uma execução de revalidação com a auditoria original e grava o antes × depois.
//
// Uso:
//   node comparar-revalidacao.mjs <pasta-execucao-original> <pasta-revalidacao>
//
// Compara, quando existirem nas duas pastas:
//   - casos de API (api/resultado.json), pelo id do caso;
//   - etapas de carga (carga/consolidado.json): capacidade, ponto de quebra,
//     p95 por degrau e disputas;
//   - fluxos das personas (matriz.json), por fluxo e persona;
//   - provas por achado (provas.json da revalidação), com o que foi medido
//     antes e depois pelas personas ou pelo orquestrador.
// Grava <revalidacao>/revalidacao.json e imprime o comparativo. Os achados
// ligados a cada item vêm do achados.json da auditoria original.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const [origArg, novaArg] = process.argv.slice(2);
if (!origArg || !novaArg) {
  console.error('uso: node comparar-revalidacao.mjs <pasta-execucao-original> <pasta-revalidacao>');
  process.exit(1);
}
const original = resolve(origArg);
const nova = resolve(novaArg);
const ler = (pasta, arquivo) => (existsSync(join(pasta, arquivo)) ? JSON.parse(readFileSync(join(pasta, arquivo), 'utf8')) : null);
const fonte = (pasta, arquivo) => relative(resolve(pasta, '..', '..'), join(pasta, arquivo));

const achados = ler(original, 'achados.json') ?? [];
const achadosDe = (pred) => achados.filter(pred).map((a) => a.id);

const itens = [];

// Provas por achado: a medição que mostra se a correção funcionou.
const provas = ler(nova, 'provas.json') ?? [];
const RESULTADOS = new Set(['corrigido', 'melhorou', 'sem-mudanca', 'piorou', 'inconclusivo']);
for (const p of provas) {
  if (!p?.achado || !p.antes?.texto || !p.depois?.texto || !RESULTADOS.has(p.resultado)) {
    console.error(`comparar: prova ignorada, faltam achado, antes.texto, depois.texto ou resultado válido: ${JSON.stringify(p).slice(0, 120)}`);
    continue;
  }
  itens.push({ tipo: 'prova', chave: p.achado, descricao: `${p.achado} · ${p.teste ?? ''}`.trim(), achados: [p.achado], antes: p.antes, depois: p.depois, resultado: p.resultado });
}

// API: por caso.
const apiAntes = ler(original, 'api/resultado.json');
const apiDepois = ler(nova, 'api/resultado.json');
if (apiAntes && apiDepois) {
  const antesPorId = Object.fromEntries(apiAntes.casos.map((c) => [c.id, c]));
  for (const depois of apiDepois.casos) {
    const antes = antesPorId[depois.id];
    if (!antes) continue;
    let resultado = 'sem-mudanca';
    if (!antes.passou && depois.passou) resultado = 'corrigido';
    else if (antes.passou && !depois.passou) resultado = 'piorou';
    else if (!antes.passou && !depois.passou && depois.falhas.length < antes.falhas.length) resultado = 'melhorou';
    itens.push({
      tipo: 'api',
      chave: depois.id,
      descricao: `${depois.endpoint} · ${depois.descricao}`,
      achados: achadosDe((a) => JSON.stringify(a.evidencias ?? []).includes(`#${depois.id}`)),
      antes: { passou: antes.passou, status: antes.obtido?.status ?? null, tempo_ms: antes.obtido?.tempo_ms ?? null, falhas: antes.falhas, criados: antes.criados, fonte: fonte(original, 'api/resultado.json') },
      depois: { passou: depois.passou, status: depois.obtido?.status ?? null, tempo_ms: depois.obtido?.tempo_ms ?? null, falhas: depois.falhas, criados: depois.criados, fonte: fonte(nova, 'api/resultado.json') },
      resultado,
    });
  }
}

// Carga: capacidade, quebra, degraus e disputas.
const cargaAntes = ler(original, 'carga/consolidado.json');
const cargaDepois = ler(nova, 'carga/consolidado.json');
if (cargaAntes && cargaDepois) {
  const capA = cargaAntes.capacidade?.usuarios ?? 0;
  const capD = cargaDepois.capacidade?.usuarios ?? 0;
  itens.push({
    tipo: 'carga',
    chave: 'capacidade',
    descricao: 'Usuários simultâneos dentro dos limites (maior degrau medido)',
    achados: achadosDe((a) => a.modo === 'carga' && ['escalabilidade', 'desempenho', 'infra'].includes(a.categoria)),
    antes: { usuarios: capA, pelo_menos: cargaAntes.capacidade?.pelo_menos ?? false, quebra: cargaAntes.ponto_de_quebra, fonte: fonte(original, 'carga/consolidado.json') },
    depois: { usuarios: capD, pelo_menos: cargaDepois.capacidade?.pelo_menos ?? false, quebra: cargaDepois.ponto_de_quebra, fonte: fonte(nova, 'carga/consolidado.json') },
    resultado: capD > capA ? (cargaDepois.ponto_de_quebra ? 'melhorou' : 'corrigido') : capD < capA ? 'piorou' : 'sem-mudanca',
  });
  const curvaA = Object.fromEntries((cargaAntes.curva ?? []).map((p) => [p.vus, p]));
  for (const p of cargaDepois.curva ?? []) {
    const a = curvaA[p.vus];
    if (!a) continue;
    let resultado = 'sem-mudanca';
    if (!a.dentro_dos_limites && p.dentro_dos_limites) resultado = 'corrigido';
    else if (a.dentro_dos_limites && !p.dentro_dos_limites) resultado = 'piorou';
    else if (p.p95_ms < a.p95_ms * 0.9) resultado = 'melhorou';
    else if (p.p95_ms > a.p95_ms * 1.1) resultado = 'piorou';
    itens.push({
      tipo: 'carga',
      chave: `degrau-${p.vus}`,
      descricao: `${p.vus} usuários simultâneos`,
      achados: [],
      antes: { p95_ms: a.p95_ms, taxa_erro: a.taxa_erro, valido: a.valido },
      depois: { p95_ms: p.p95_ms, taxa_erro: p.taxa_erro, valido: p.valido },
      resultado,
    });
  }
  const dispA = Object.fromEntries((cargaAntes.disputas ?? []).map((d) => [d.id, d]));
  for (const d of cargaDepois.disputas ?? []) {
    const a = dispA[d.id];
    if (!a) continue;
    itens.push({
      tipo: 'disputa',
      chave: d.id,
      descricao: d.descricao,
      achados: achadosDe((x) => x.categoria === 'disputa'),
      antes: { sucessos: a.sucessos, verificacao: [a.verificacao_antes, a.verificacao_depois], passou: a.passou },
      depois: { sucessos: d.sucessos, verificacao: [d.verificacao_antes, d.verificacao_depois], passou: d.passou },
      resultado: d.passou === null ? 'inconclusivo' : a.passou === false && d.passou ? 'corrigido' : a.passou && d.passou === false ? 'piorou' : 'sem-mudanca',
    });
  }
}

// Personas: por fluxo × persona.
const RANK = { nao_executado: -1, abandonou: 0, falhou: 0, concluiu_com_problemas: 1, concluiu: 2 };
const matA = ler(original, 'matriz.json');
const matD = ler(nova, 'matriz.json');
if (matA && matD) {
  for (const [fluxo, porPersona] of Object.entries(matD.celulas ?? {})) {
    for (const [persona, d] of Object.entries(porPersona)) {
      const a = matA.celulas?.[fluxo]?.[persona];
      if (!a) continue;
      const delta = (RANK[d.resultado] ?? 0) - (RANK[a.resultado] ?? 0);
      itens.push({
        tipo: 'personas',
        chave: `${fluxo}/${persona}`,
        descricao: `Fluxo ${fluxo} com a persona ${persona}`,
        achados: [...new Set([...(a.achados ?? []), ...(d.achados ?? [])])],
        antes: { resultado: a.resultado, passos: a.passos },
        depois: { resultado: d.resultado, passos: d.passos },
        resultado: d.resultado === 'nao_executado' ? 'inconclusivo' : delta > 0 ? (d.resultado === 'concluiu' ? 'corrigido' : 'melhorou') : delta < 0 ? 'piorou' : 'sem-mudanca',
      });
    }
  }
}

const resumo = itens.reduce((acc, i) => ({ ...acc, [i.resultado]: (acc[i.resultado] ?? 0) + 1 }), {});
const saida = { gerado_em: new Date().toISOString(), original: fonte(original, '.'), revalidacao: fonte(nova, '.'), resumo, itens };
writeFileSync(join(nova, 'revalidacao.json'), `${JSON.stringify(saida, null, 2)}\n`);

const SIMBOLO = { corrigido: '✅', melhorou: '⬆️', 'sem-mudanca': '➖', piorou: '❌', inconclusivo: '⏸' };
const mostrar = (o) =>
  o.texto !== undefined
    ? o.texto
    : o.passou !== undefined && o.status !== undefined
    ? `${o.passou ? 'passou' : 'falhou'} (status ${o.status}${o.criados !== undefined ? `, ${o.criados} criados` : ''})`
    : o.usuarios !== undefined
      ? `${o.pelo_menos ? '≥' : '~'}${o.usuarios} usuários`
      : o.p95_ms !== undefined
        ? `p95 ${Math.round(o.p95_ms)} ms, erro ${((o.taxa_erro ?? 0) * 100).toFixed(1)}%`
        : o.sucessos !== undefined
          ? `${o.sucessos} sucessos, ${o.verificacao.join(' → ')}`
          : `${o.resultado} (${o.passos ?? '-'} passos)`;
console.log('\nAntes × depois\n');
for (const i of itens) console.log(`${SIMBOLO[i.resultado] ?? '?'} ${i.tipo.padEnd(9)} ${i.descricao}\n     antes: ${mostrar(i.antes)}\n     depois: ${mostrar(i.depois)}`);
console.log(`\n${Object.entries(resumo).map(([k, v]) => `${v} ${k}`).join(' · ')}\n`);
