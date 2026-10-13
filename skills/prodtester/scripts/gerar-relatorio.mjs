#!/usr/bin/env node
// Gera relatorio.html (autocontido, abre offline) e relatorio.md de uma execução.
//
// Uso:
//   node gerar-relatorio.mjs <pasta-execucao>
//
// Lê só os arquivos da execução (formato-dados.md). Calcula o placar pela
// fórmula de relatorio.md. Embute screenshots e diffs no HTML.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pasta = resolve(process.argv[2] ?? '.');
const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSAO = (() => {
  try {
    return JSON.parse(readFileSync(resolve(skill, '..', '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
  } catch {
    return null;
  }
})();

const ler = (arquivo, padrao = null) => {
  const caminho = join(pasta, arquivo);
  if (!existsSync(caminho)) return padrao;
  try {
    return JSON.parse(readFileSync(caminho, 'utf8'));
  } catch (erro) {
    console.error(`gerar-relatorio: ignorando ${arquivo} (${erro.message})`);
    return padrao;
  }
};
const lerLinhas = (arquivo) =>
  existsSync(join(pasta, arquivo))
    ? readFileSync(join(pasta, arquivo), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean)
    : [];
const cabecalho = (arquivo) => {
  if (!existsSync(arquivo)) return {};
  const bloco = readFileSync(arquivo, 'utf8').match(/^---\n([\s\S]*?)\n---/);
  if (!bloco) return {};
  return Object.fromEntries(
    bloco[1].split('\n').map((l) => l.match(/^([a-z_]+):\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]),
  );
};

const contexto = ler('contexto.json', {});
// Nome do sistema: do contexto ou, se faltar, do testes-fluxos.yaml do projeto.
if (!contexto.sistema?.nome) {
  const yaml = resolve(pasta, '..', '..', 'testes-fluxos.yaml');
  const nome = existsSync(yaml) ? readFileSync(yaml, 'utf8').match(/^sistema:\s*\n(?:[ \t]+.*\n)*?[ \t]+nome:\s*(.+)$/m) : null;
  if (nome) contexto.sistema = { ...(contexto.sistema ?? {}), nome: nome[1].trim().replace(/^["']|["']$/g, '') };
}
const achados = ler('achados.json', []);
const matriz = ler('matriz.json');
const requisicoes = ler('requisicoes.json', []);
const apiResultado = ler('api/resultado.json');
const apiTabela = ler('api/tabela.json');
const carga = ler('carga/consolidado.json');
const plano = ler('plano-correcao.json');
const revalidacao = ler('revalidacao.json');
const narrativa = lerLinhas('narrativa.jsonl');

// ---------- placar ----------

const PENALIDADE = { critica: 20, alta: 10, media: 4, baixa: 1 };
const PESOS = { personas: 30, api: 35, carga: 35 };
const FAIXAS = [
  [90, 'Pronto para crescer'],
  [75, 'Saudável, com ajustes'],
  [60, 'Precisa de atenção'],
  [40, 'Arriscado'],
  [0, 'Crítico'],
];
const modoDoAchado = (a) => (a.modo === 'volume' ? 'carga' : a.modo === 'preparacao' ? 'api' : a.modo);
const rodou = {
  personas: Boolean(matriz && Object.keys(matriz.celulas ?? {}).length),
  api: Boolean(apiResultado),
  carga: Boolean(carga),
};
const modos = {};
let somaPesos = 0;
let somaNotas = 0;
for (const modo of Object.keys(PESOS)) {
  const penal = achados.filter((a) => modoDoAchado(a) === modo).reduce((s, a) => s + (PENALIDADE[a.severidade] ?? 0), 0);
  const nota = Math.max(0, 100 - penal);
  modos[modo] = { avaliado: rodou[modo], nota: rodou[modo] ? nota : null, peso: PESOS[modo], penalidade: penal };
  if (rodou[modo]) {
    somaPesos += PESOS[modo];
    somaNotas += nota * PESOS[modo];
  }
}
const temCritico = achados.some((a) => a.severidade === 'critica');
let geral = somaPesos ? Math.round(somaNotas / somaPesos) : null;
const tetoAplicado = geral !== null && temCritico && geral > 59;
if (tetoAplicado) geral = 59;
const faixa = geral === null ? null : FAIXAS.find(([min]) => geral >= min)[1];
const placar = { geral, faixa, modos, teto_critico: tetoAplicado, tem_critico: temCritico };

// ---------- capacidade ----------

let capacidade = null;
if (carga?.capacidade) {
  const c = carga.capacidade;
  capacidade = {
    usuarios: c.usuarios,
    pelo_menos: Boolean(c.pelo_menos),
    p95_ms: c.p95_ms,
    limite_p95_ms: carga.limites?.p95_ms ?? 500,
    texto: c.pelo_menos
      ? `Aguenta pelo menos ${c.usuarios} usuários simultâneos com p95 abaixo de ${carga.limites?.p95_ms ?? 500} ms (maior degrau testado).`
      : `Aguenta ~${c.usuarios} usuários simultâneos com p95 abaixo de ${carga.limites?.p95_ms ?? 500} ms.`,
  };
}
const capRevalidada = revalidacao?.itens?.find((i) => i.tipo === 'carga' && i.chave === 'capacidade');
const capacidadeDepois = capRevalidada
  ? { usuarios: capRevalidada.depois.usuarios, pelo_menos: capRevalidada.depois.pelo_menos, medida: true }
  : null;

// ---------- personas ----------

const LIMITE_IMAGENS = 60;
const LIMITE_BYTES = 12 * 1024 * 1024;
let imagens = 0;
let bytes = 0;
const imagensOmitidas = [];
function imagem(caminhoRelativo) {
  if (!caminhoRelativo) return null;
  const caminho = join(pasta, caminhoRelativo);
  if (!existsSync(caminho)) return null;
  const tamanho = statSync(caminho).size;
  if (imagens >= LIMITE_IMAGENS || bytes + tamanho > LIMITE_BYTES) {
    imagensOmitidas.push(caminhoRelativo);
    return null;
  }
  imagens += 1;
  bytes += tamanho;
  const tipo = caminho.endsWith('.jpg') || caminho.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return `data:${tipo};base64,${readFileSync(caminho).toString('base64')}`;
}

const personas = [];
const dirPersonas = join(pasta, 'personas');
if (existsSync(dirPersonas)) {
  for (const id of readdirSync(dirPersonas).sort()) {
    const dir = join(dirPersonas, id);
    if (!statSync(dir).isDirectory()) continue;
    const cab = cabecalho(join(dir, 'persona.md'));
    const passos = lerLinhas(`personas/${id}/passos.jsonl`).map((p) => {
      const ref = p.screenshot ? (p.screenshot.startsWith('personas/') ? p.screenshot : `personas/${id}/${p.screenshot}`) : null;
      return {
        n: p.n,
        fluxo: p.fluxo,
        acao: p.acao,
        viu: p.viu,
        reacao: p.reacao,
        erros: [...(p.console_erros ?? []).map(String), ...(p.rede_erros ?? []).map((e) => `${e.metodo ?? ''} ${e.rota ?? ''} → ${e.status ?? '?'}`.trim())],
        screenshot: imagem(ref),
        screenshot_ref: ref,
      };
    });
    personas.push({
      id,
      nome: cab.nome ?? id,
      idade: cab.idade ?? null,
      emoji: cab.emoji ?? '🙂',
      cor: cab.cor ?? 'blue',
      bordao: cab.bordao ?? null,
      dispositivo: cab.dispositivo ?? null,
      resumo: ler(`personas/${id}/resumo.json`, { fluxos: [] }),
      passos,
      falas: narrativa.filter((f) => f.persona === id).map((f) => ({ t: f.t, tipo: f.tipo, texto: f.texto })),
    });
  }
}

// ---------- achados e conduta ----------

const ORDEM_SEV = { critica: 0, alta: 1, media: 2, baixa: 3 };
const ordenados = [...achados].sort((a, b) => (ORDEM_SEV[a.severidade] ?? 9) - (ORDEM_SEV[b.severidade] ?? 9) || (b.impacto ?? 0) - (a.impacto ?? 0));
const contagem = Object.fromEntries(Object.keys(PENALIDADE).map((s) => [s, achados.filter((a) => a.severidade === s).length]));
const diffs = {};
for (const a of achados) {
  const ref = a.correcao?.diff;
  if (ref && existsSync(join(pasta, ref))) diffs[a.id] = readFileSync(join(pasta, ref), 'utf8').slice(0, 60000);
}
for (const a of achados) {
  for (const ev of a.evidencias ?? []) {
    if (ev.tipo === 'screenshot' && ev.ref) ev.imagem = imagem(ev.ref);
  }
}

// ---------- limites ----------

const limites = [
  'Agentes de IA não são determinísticos: duas execuções podem seguir caminhos diferentes. Por isso cada achado traz a evidência que o sustenta.',
  'As personas simulam comportamentos e não substituem testes com pessoas reais, principalmente em acessibilidade com leitores de tela de verdade.',
  'As correções propostas são pontos de partida e precisam de revisão humana antes de ir para produção.',
];
if (contexto.alvo?.ambiente === 'staging' || contexto.alvo?.ambiente === 'local') {
  limites.push(
    `Os testes rodaram em ambiente ${contexto.alvo.ambiente}${contexto.infra?.hospedagem_producao ? `, e a produção roda em: ${contexto.infra.hospedagem_producao}` : ''}. Se a infraestrutura for diferente, a capacidade em produção também será.`,
  );
}
for (const p of contexto.modos_pulados ?? []) limites.push(`Etapa ${p.modo} não executada: ${p.motivo}.`);
for (const a of carga?.alertas ?? []) limites.push(a);
if (imagensOmitidas.length) limites.push(`${imagensOmitidas.length} screenshots ficaram fora do relatório por tamanho; estão na pasta da execução.`);

// ---------- dados ----------

const dados = {
  versao: VERSAO,
  gerado_em: new Date().toISOString(),
  execucao: contexto.execucao ?? basename(pasta),
  meta: {
    sistema: contexto.sistema?.nome ?? contexto.nome ?? null,
    alvo: contexto.alvo?.url ?? null,
    ambiente: contexto.alvo?.ambiente ?? null,
    perfil: contexto.perfil?.principal ?? null,
    perfil_evidencias: contexto.perfil?.evidencias ?? [],
    stack: contexto.stack ?? null,
    modo: contexto.modo ?? null,
    revalidacao_de: contexto.revalidacao_de ?? null,
  },
  placar,
  capacidade,
  capacidade_depois: capacidadeDepois,
  contagem,
  achados: ordenados,
  top5: ordenados.slice(0, 5).map((a) => a.id),
  matriz,
  personas,
  requisicoes,
  api: apiResultado ? { resumo: apiResultado.resumo, tabela: apiTabela, casos: apiResultado.casos, erros_contas: apiResultado.erros_contas } : null,
  carga,
  plano,
  diffs,
  revalidacao,
  limites,
  pesos: PESOS,
  penalidades: PENALIDADE,
};

// ---------- HTML ----------

const modelo = readFileSync(join(skill, 'templates', 'relatorio.html'), 'utf8');
const json = JSON.stringify(dados).replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');
if (!modelo.includes('/*__DADOS__*/null')) {
  console.error('gerar-relatorio: o modelo relatorio.html não tem o marcador /*__DADOS__*/null');
  process.exit(1);
}
const html = modelo.replace('/*__DADOS__*/null', () => json).replace('<title>Laudo prodtester</title>', () => `<title>Laudo · ${escaparHtml(dados.meta.sistema ?? dados.meta.alvo ?? 'sistema')}</title>`);
writeFileSync(join(pasta, 'relatorio.html'), html);

function escaparHtml(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---------- Markdown ----------

const SEV = { critica: '🔴 crítica', alta: '🟠 alta', media: '🟡 média', baixa: '⚪ baixa' };
const SEV_PLURAL = { critica: 'críticas', alta: 'altas', media: 'médias', baixa: 'baixas' };
const PERFIS = { 'saas-multitenant': 'SaaS multiusuário', 'local-first': 'App local-first', 'api-publica': 'API pública' };
const EVID = { screenshot: 'tela', requisicao: 'requisição', k6: 'medição de carga', console: 'console', explain: 'plano da consulta', log: 'log', codigo: 'código', passo: 'passo', medicao: 'medição' };
const RES = { concluiu: '✅', concluiu_com_problemas: '⚠️', falhou: '❌', abandonou: '❌', nao_executado: '—' };
const ms = (v) => (v == null ? '-' : `${Math.round(v)} ms`);
const pct = (v) => (v == null ? '-' : `${(v * 100).toFixed(2)}%`);
const md = [];
md.push(`# Laudo de auditoria${dados.meta.sistema ? `: ${dados.meta.sistema}` : ''}`, '');
md.push(`- **Alvo:** ${dados.meta.alvo ?? '-'} (${dados.meta.ambiente ?? '-'})`);
md.push(`- **Perfil:** ${PERFIS[dados.meta.perfil] ?? dados.meta.perfil ?? '-'}`);
md.push(`- **Execução:** ${dados.execucao}`);
if (dados.meta.revalidacao_de) md.push(`- **Revalidação de:** ${dados.meta.revalidacao_de}`);
md.push('');
md.push('## Resultado', '');
md.push(`**Placar de saúde: ${geral ?? 'não avaliado'}${geral !== null ? '/100' : ''}**${faixa ? ` (${faixa})` : ''}${tetoAplicado ? ', limitado a 59 por haver achado crítico' : ''}.`, '');
md.push('| Modo | Nota | Peso |', '|---|---|---|');
for (const [m, v] of Object.entries(modos)) md.push(`| ${m} | ${v.avaliado ? v.nota : 'não avaliado'} | ${v.peso} |`);
md.push('');
if (capacidade) md.push(`**Capacidade medida:** ${capacidade.texto}`, '');
md.push(`**Depois das correções:** ${capacidadeDepois ? `${capacidadeDepois.pelo_menos ? 'pelo menos ' : '~'}${capacidadeDepois.usuarios} usuários (medido na revalidação)` : 'a medir com `/prodtester:revalidar`'}.`, '');
md.push(`Achados: ${Object.entries(contagem).map(([s, n]) => `${n} ${SEV_PLURAL[s]}`).join(', ')}.`, '');

if (ordenados.length) {
  md.push('## Principais achados', '');
  for (const a of ordenados.slice(0, 5)) {
    md.push(`### ${a.id} · ${a.titulo}`, '');
    md.push(`${SEV[a.severidade] ?? a.severidade} · ${a.modo} · ${a.categoria}${a.onde?.endpoint ? ` · \`${a.onde.endpoint}\`` : ''}`, '');
    for (const ev of a.evidencias ?? []) md.push(`- Evidência (${EVID[ev.tipo] ?? ev.tipo}): ${ev.resumo ?? ''}${ev.ref ? ` \`${ev.ref}\`` : ''}`);
    if (a.causa_raiz) md.push(`- Causa ${a.causa_raiz.status === 'confirmada' ? 'confirmada' : 'provável'}: ${a.causa_raiz.descricao ?? ''}`);
    if (a.correcao?.resumo) md.push(`- Correção: ${a.correcao.resumo}`);
    md.push('');
  }
}

if (matriz && Object.keys(matriz.celulas ?? {}).length) {
  md.push('## Personas', '');
  md.push(`| Fluxo | ${matriz.personas.map((p) => `${p.emoji} ${p.nome}`).join(' | ')} |`);
  md.push(`|---|${matriz.personas.map(() => '---').join('|')}|`);
  for (const f of matriz.fluxos) {
    md.push(`| ${f.nome} | ${matriz.personas.map((p) => {
      const c = matriz.celulas[f.id]?.[p.id];
      return c ? `${RES[c.resultado] ?? '?'} ${c.passos ?? '-'} passos` : '—';
    }).join(' | ')} |`);
  }
  md.push('');
}

if (apiTabela) {
  const TIPOS = apiTabela.tipos;
  md.push('## API', '');
  md.push(`| Endpoint | ${TIPOS.join(' | ')} | Tempo máx. |`, `|---|${TIPOS.map(() => '---').join('|')}|---|`);
  for (const e of apiTabela.endpoints) md.push(`| \`${e.endpoint}\` | ${TIPOS.map((t) => e.celulas[t]).join(' | ')} | ${ms(e.tempo_max_ms)} |`);
  md.push('');
}

if (carga) {
  md.push('## Carga', '');
  md.push('| Usuários | p95 | Erro | Dentro dos limites |', '|---|---|---|---|');
  for (const p of carga.curva ?? []) md.push(`| ${p.vus} | ${ms(p.p95_ms)} | ${pct(p.taxa_erro)} | ${p.valido === false ? '⚠️ gerador saturado' : p.dentro_dos_limites ? '✅' : '❌'} |`);
  md.push('');
  if (carga.ponto_de_quebra) md.push(`**Ponto de quebra:** ${carga.ponto_de_quebra.usuarios} usuários (${carga.ponto_de_quebra.motivo}).`, '');
  for (const d of carga.disputas ?? []) {
    md.push(`**Disputa ${d.id}:** ${d.descricao ?? ''} ${d.sucessos} sucessos; valor ${d.verificacao_antes} → ${d.verificacao_depois}. ${d.passou === true ? '✅' : d.passou === false ? `❌ ${d.violacoes.join('; ')}` : `⏸ inconclusiva: ${(d.inconclusiva ?? []).join('; ')}`}`, '');
  }
  for (const v of carga.volumes ?? []) md.push(`- Volume ${v.volume}: p95 ${ms(v.p95_ms)}, erro ${pct(v.taxa_erro)}`);
  if ((carga.volumes ?? []).length) md.push('');
}

if (plano?.grupos?.length) {
  md.push('## Conduta: plano de correção', '');
  for (const g of plano.grupos) {
    md.push(`### ${g.titulo}`, '');
    for (const i of g.itens) {
      md.push(`- **${i.id}** ${i.titulo} (${i.camada ?? '-'}, causa ${i.causa === 'confirmada' ? 'confirmada' : 'provável'}, impacto ${i.impacto ?? '-'}, esforço ${i.esforco ?? '-'})${i.correcao ? `: ${i.correcao}` : ''}`);
      if (diffs[i.id]) md.push('', '  ```diff', ...diffs[i.id].trimEnd().split('\n').map((l) => `  ${l}`), '  ```', '');
    }
    md.push('');
  }
}

if (revalidacao?.itens?.length) {
  md.push('## Antes × depois', '');
  md.push('| Item | Antes | Depois | Resultado |', '|---|---|---|---|');
  const resumir = (o) => (o.passou !== undefined && o.status !== undefined ? `${o.passou ? 'passou' : 'falhou'} (${o.status})` : o.usuarios !== undefined ? `${o.usuarios} usuários` : o.p95_ms !== undefined ? `p95 ${ms(o.p95_ms)}` : o.sucessos !== undefined ? `${o.sucessos} sucessos` : o.resultado ?? '-');
  for (const i of revalidacao.itens) md.push(`| ${i.descricao} | ${resumir(i.antes)} | ${resumir(i.depois)} | ${i.resultado} |`);
  md.push('');
}

md.push('## Limites e método', '');
for (const l of limites) md.push(`- ${l}`);
md.push('');
md.push(`Placar: penalidade por achado (crítica ${PENALIDADE.critica}, alta ${PENALIDADE.alta}, média ${PENALIDADE.media}, baixa ${PENALIDADE.baixa}); nota de cada modo = 100 − penalidades (mínimo 0); geral = média ponderada dos modos que rodaram (personas ${PESOS.personas}, api ${PESOS.api}, carga ${PESOS.carga}); com achado crítico, no máximo 59.`, '');
md.push(`_Gerado pelo prodtester${VERSAO ? ` ${VERSAO}` : ''} em ${new Date().toLocaleString('pt-BR')}._`, '');
writeFileSync(join(pasta, 'relatorio.md'), md.join('\n'));

console.log(`Placar: ${geral ?? 'não avaliado'}${faixa ? ` (${faixa})` : ''}`);
if (capacidade) console.log(capacidade.texto);
console.log(`Relatório: ${join(pasta, 'relatorio.html')}`);
console.log(`Markdown:  ${join(pasta, 'relatorio.md')}`);
if (imagensOmitidas.length) console.log(`${imagensOmitidas.length} screenshots ficaram fora por tamanho.`);
