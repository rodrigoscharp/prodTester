// carga.k6.js — testes de carga gerados pelo prodtester.
//
// Simula usuários percorrendo as jornadas reais do sistema, descritas em
// cenario-carga.json, numa etapa por execução.
//
// Uso:
//   k6 run carga.k6.js                         (etapa smoke)
//   PRODTESTER_ETAPA=estresse k6 run carga.k6.js
//
// Variáveis de ambiente:
//   PRODTESTER_ETAPA      smoke | esperada | estresse | pico | resistencia | responsividade | disputa
//   PRODTESTER_DISPUTA    id do cenário de disputa (etapa disputa)
//   PRODTESTER_VOLUME     rótulo do volume de dados (perfil local-first), só para registro
//   PRODTESTER_CENARIO    caminho do cenário (padrão ./cenario-carga.json)
//   PRODTESTER_SAIDA      arquivo de resultado (padrão ./carga-<etapa>.json)
//   PRODTESTER_BASE_URL   substitui a base_url do cenário
//   PRODTESTER_SEGREDOS   arquivo .env com credenciais de teste
//   PRODTESTER_FALHAR     com 1, o k6 sai com erro se a etapa passar dos limites de p95 e erro (uso no CI)
// A execução é interrompida sozinha quando a taxa de erro de um degrau passa
// do limite de interrupção do cenário (padrão 5%).

import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';
import { Counter, Gauge } from 'k6/metrics';

const C = JSON.parse(open(__ENV.PRODTESTER_CENARIO || './cenario-carga.json'));
const ETAPA = __ENV.PRODTESTER_ETAPA || 'smoke';
const SAIDA = __ENV.PRODTESTER_SAIDA || `./carga-${ETAPA}.json`;
const BASE = (__ENV.PRODTESTER_BASE_URL || C.base_url || '').replace(/\/$/, '');
const VOLUME = __ENV.PRODTESTER_VOLUME || null;
const LIMITES = Object.assign({ p95_ms: 500, taxa_erro: 0.01 }, C.thresholds || {});
const PARAR = Object.assign({ taxa_erro: 0.05 }, C.interromper_se || {});
const SEGREDOS = carregarSegredos(__ENV.PRODTESTER_SEGREDOS);
const ESPERADO = C.pico_esperado_usuarios || 50;

const PADROES = {
  smoke: { vus: 3, duracao: '1m' },
  esperada: { vus: ESPERADO, subida: '1m', duracao: '5m' },
  estresse: { degraus: [50, 100, 250, 500, 1000], subida_degrau: '30s', duracao_degrau: '2m' },
  pico: { vus: ESPERADO * 3, subida: '10s', duracao: '1m' },
  resistencia: { vus: ESPERADO, subida: '1m', duracao: '30m' },
  responsividade: { vus: 2, duracao: '2m' },
};
const CONFIG = Object.assign({}, PADROES[ETAPA] || {}, (C.etapas || {})[ETAPA] || {});
const DISPUTA = ETAPA === 'disputa' ? (C.disputa || []).find((d) => d.id === __ENV.PRODTESTER_DISPUTA) : null;
if (ETAPA === 'disputa' && !DISPUTA) throw new Error(`cenário de disputa "${__ENV.PRODTESTER_DISPUTA}" não existe em cenario-carga.json`);
if (ETAPA !== 'disputa' && !PADROES[ETAPA]) throw new Error(`etapa desconhecida: ${ETAPA}`);

const disputaSucessos = new Counter('disputa_sucessos');
const disputaFalhas = new Counter('disputa_falhas');
const disputaDepois = new Gauge('disputa_depois');

// ---------- utilitários ----------

function segundos(texto) {
  const m = String(texto).match(/^(\d+(?:\.\d+)?)(ms|s|m|h)$/);
  if (!m) throw new Error(`duração inválida: ${texto}`);
  const n = Number(m[1]);
  return { ms: n / 1000, s: n, m: n * 60, h: n * 3600 }[m[2]];
}

function carregarSegredos(caminho) {
  const valores = {};
  if (!caminho) return valores;
  for (const linha of open(caminho).split('\n')) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) valores[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return valores;
}

function segredo(nome) {
  const valor = SEGREDOS[nome] !== undefined ? SEGREDOS[nome] : __ENV[nome];
  if (valor === undefined || valor === '') throw new Error(`credencial ${nome} não definida`);
  return valor;
}

// Codifica só caracteres fora do ASCII (acentos, emoji) e espaços, para não
// codificar de novo o que já veio codificado.
function codificarRota(rota) {
  return String(rota).replace(/[^\x21-\x7E]/gu, (c) => encodeURIComponent(c));
}

function caminho(objeto, rota) {
  return String(rota).split('.').reduce((atual, parte) => (atual == null ? undefined : atual[parte]), objeto);
}

function lerJson(res) {
  try {
    return res.json();
  } catch (_) {
    return undefined;
  }
}

function sortear(lista) {
  return lista[Math.floor(Math.random() * lista.length)];
}

// {{variavel}}, {{segredo:NOME}}, {{aleatorio}}, {{escolher:caminho.na.secao.dados}}, {{vu}}, {{iteracao}}
function substituir(valor, variaveis) {
  if (typeof valor === 'string') {
    const inteiro = valor.match(/^\{\{([^}]+)\}\}$/);
    if (inteiro) {
      const chave = inteiro[1];
      if (chave.startsWith('escolher:')) return sortear(caminho(C.dados || {}, chave.slice(9)) || [null]);
      if (variaveis[chave] !== undefined && typeof variaveis[chave] !== 'string') return variaveis[chave];
    }
    return valor.replace(/\{\{([^}]+)\}\}/g, (_, chave) => {
      if (chave.startsWith('segredo:')) return segredo(chave.slice(8));
      if (chave.startsWith('escolher:')) return String(sortear(caminho(C.dados || {}, chave.slice(9)) || ['']));
      if (chave === 'aleatorio') return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      if (chave === 'vu') return String(exec.vu.idInTest);
      if (chave === 'iteracao') return String(exec.vu.iterationInScenario);
      if (variaveis[chave] === undefined) throw new Error(`variável {{${chave}}} sem valor`);
      return String(variaveis[chave]);
    });
  }
  if (Array.isArray(valor)) return valor.map((v) => substituir(v, variaveis));
  if (valor && typeof valor === 'object') {
    const novo = {};
    for (const k of Object.keys(valor)) novo[k] = substituir(valor[k], variaveis);
    return novo;
  }
  return valor;
}

function montarRequisicao(req, cabecalhosConta, variaveis) {
  const r = substituir(req, variaveis);
  const cabecalhos = Object.assign({}, cabecalhosConta, r.cabecalhos || {});
  let corpo = null;
  if (r.corpo !== undefined) {
    corpo = JSON.stringify(r.corpo);
    if (!cabecalhos['Content-Type']) cabecalhos['Content-Type'] = 'application/json';
  }
  return { metodo: (r.metodo || 'GET').toUpperCase(), url: BASE + codificarRota(r.rota), corpo, cabecalhos };
}

function login(conta) {
  const tipo = conta.tipo || 'bearer';
  if (tipo === 'bearer') return { Authorization: `Bearer ${segredo(conta.token_env)}` };
  if (tipo === 'cabecalho') return { [conta.cabecalho]: segredo(conta.token_env) };
  if (tipo === 'cookie') return { Cookie: segredo(conta.token_env) };
  const l = substituir(conta.login, {});
  const res = http.request(l.metodo || 'POST', BASE + l.rota, JSON.stringify(l.corpo || {}), {
    headers: { 'Content-Type': 'application/json' },
    tags: { prodtester: 'preparacao' },
  });
  if (res.status < 200 || res.status >= 300) throw new Error(`login falhou com status ${res.status}`);
  if (l.extrair_cookie) {
    const c = (res.cookies || {})[l.extrair_cookie];
    if (!c || !c[0]) throw new Error(`login não devolveu o cookie ${l.extrair_cookie}`);
    return { Cookie: `${l.extrair_cookie}=${c[0].value}` };
  }
  const token = caminho(lerJson(res), l.extrair || 'token');
  if (!token) throw new Error(`login não devolveu ${l.extrair || 'token'}`);
  return l.tipo === 'cabecalho' ? { [l.cabecalho]: String(token) } : { Authorization: `Bearer ${token}` };
}

// ---------- plano da etapa ----------

// Cada fase: { ate_s: fim da fase em segundos desde o início, rotulo: degrau ou "transicao" }.
function montarPlano() {
  if (ETAPA === 'disputa') return { cenario: null, fases: [], degraus: [String(DISPUTA.usuarios || 50)] };
  if (ETAPA === 'estresse') {
    const stages = [];
    const fases = [];
    let t = 0;
    for (const alvo of CONFIG.degraus) {
      stages.push({ duration: CONFIG.subida_degrau, target: alvo });
      t += segundos(CONFIG.subida_degrau);
      fases.push({ ate_s: t, rotulo: 'transicao' });
      stages.push({ duration: CONFIG.duracao_degrau, target: alvo });
      t += segundos(CONFIG.duracao_degrau);
      fases.push({ ate_s: t, rotulo: String(alvo) });
    }
    stages.push({ duration: '20s', target: 0 });
    fases.push({ ate_s: t + 20, rotulo: 'transicao' });
    return {
      cenario: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '10s' },
      fases,
      degraus: CONFIG.degraus.map(String),
    };
  }
  if (CONFIG.subida) {
    const sobe = segundos(CONFIG.subida);
    const fica = segundos(CONFIG.duracao);
    return {
      cenario: {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
          { duration: CONFIG.subida, target: CONFIG.vus },
          { duration: CONFIG.duracao, target: CONFIG.vus },
          { duration: '10s', target: 0 },
        ],
        gracefulRampDown: '10s',
      },
      fases: [
        { ate_s: sobe, rotulo: 'transicao' },
        { ate_s: sobe + fica, rotulo: String(CONFIG.vus) },
        { ate_s: sobe + fica + 10, rotulo: 'transicao' },
      ],
      degraus: [String(CONFIG.vus)],
    };
  }
  return {
    cenario: { executor: 'constant-vus', vus: CONFIG.vus, duration: CONFIG.duracao },
    fases: [{ ate_s: segundos(CONFIG.duracao) + 60, rotulo: String(CONFIG.vus) }],
    degraus: [String(CONFIG.vus)],
  };
}

const PLANO = montarPlano();
const PASSOS = [];
for (const j of C.jornadas || []) for (const p of j.passos || []) PASSOS.push(`${j.id}.${p.id}`);

function degrauAtual() {
  if (ETAPA === 'disputa') return PLANO.degraus[0];
  const decorrido = (Date.now() - exec.scenario.startTime) / 1000;
  for (const f of PLANO.fases) if (decorrido < f.ate_s) return f.rotulo;
  return 'transicao';
}

function montarOpcoes() {
  // Na disputa, recusas (409, 422…) são respostas esperadas e não interrompem o teste.
  const interromper = (atraso) =>
    ETAPA === 'disputa' ? ['rate>=0'] : [{ threshold: `rate<${PARAR.taxa_erro}`, abortOnFail: true, delayAbortEval: atraso }];
  const thresholds = { http_req_failed: interromper('20s') };
  for (const d of PLANO.degraus) {
    thresholds[`http_req_duration{degrau:${d}}`] = ['p(95)>=0'];
    thresholds[`http_reqs{degrau:${d}}`] = ['count>=0'];
    thresholds[`http_req_failed{degrau:${d}}`] = interromper('15s');
  }
  if (__ENV.PRODTESTER_FALHAR === '1' && ETAPA !== 'disputa') {
    thresholds.http_req_duration = [`p(95)<${LIMITES.p95_ms}`];
    thresholds.http_req_failed = thresholds.http_req_failed.concat([`rate<${LIMITES.taxa_erro}`]);
  }
  for (const p of PASSOS) {
    thresholds[`http_req_duration{passo:${p}}`] = ['p(95)>=0'];
    thresholds[`http_req_failed{passo:${p}}`] = ['rate>=0'];
  }
  const opcoes = {
    setupTimeout: '2m',
    teardownTimeout: '2m',
    summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
    thresholds,
    discardResponseBodies: false,
  };
  if (ETAPA === 'disputa') {
    opcoes.scenarios = {
      disputa: { executor: 'per-vu-iterations', vus: DISPUTA.usuarios || 50, iterations: 1, maxDuration: '2m', exec: 'disputa' },
    };
  } else {
    opcoes.scenarios = { [ETAPA]: Object.assign({ exec: 'jornada' }, PLANO.cenario) };
  }
  return opcoes;
}

export const options = montarOpcoes();

// ---------- execução ----------

function medirVerificacao(verificacao, cabecalhos) {
  if (!verificacao) return null;
  const r = montarRequisicao(verificacao.requisicao, cabecalhos, {});
  const res = http.request(r.metodo, r.url, r.corpo, { headers: r.cabecalhos, tags: { prodtester: 'verificacao' } });
  const corpo = lerJson(res);
  if (verificacao.contar) {
    const lista = verificacao.campo ? caminho(corpo, verificacao.campo) : corpo;
    return Array.isArray(lista) ? lista.length : null;
  }
  const valor = caminho(corpo, verificacao.campo);
  return typeof valor === 'number' ? valor : Number(valor);
}

export function setup() {
  const sessoes = [];
  const erros = [];
  for (const nome of Object.keys(C.contas || {})) {
    try {
      sessoes.push(login(C.contas[nome]));
    } catch (e) {
      erros.push(`${nome}: ${e.message || e}`);
    }
  }
  const dados = { sessoes, erros_contas: erros, inicio: Date.now() };
  if (ETAPA === 'disputa') {
    const cab = DISPUTA.conta === 'nenhuma' || !sessoes.length ? {} : sessoes[0];
    dados.antes = medirVerificacao(DISPUTA.verificacao, cab);
    dados.largada = Date.now() + 3000;
  }
  return dados;
}

function cabecalhosDoVu(dados, conta) {
  if (!conta || conta === 'nenhuma' || !dados.sessoes.length) return {};
  return dados.sessoes[(exec.vu.idInTest - 1) % dados.sessoes.length];
}

function escolherJornada() {
  const jornadas = C.jornadas || [];
  const total = jornadas.reduce((s, j) => s + (j.peso || 1), 0);
  let sorteio = Math.random() * total;
  for (const j of jornadas) {
    sorteio -= j.peso || 1;
    if (sorteio <= 0) return j;
  }
  return jornadas[jornadas.length - 1];
}

export function jornada(dados) {
  const j = escolherJornada();
  const cab = cabecalhosDoVu(dados, j.conta);
  const variaveis = {};
  for (const p of j.passos) {
    const r = montarRequisicao(p.requisicao, cab, variaveis);
    const res = http.request(r.metodo, r.url, r.corpo, {
      headers: r.cabecalhos,
      timeout: p.timeout || '30s',
      tags: { jornada: j.id, passo: `${j.id}.${p.id}`, degrau: degrauAtual(), volume: VOLUME || 'n/a' },
    });
    const esperados = p.status || null;
    check(res, { [`${j.id}.${p.id} ok`]: (x) => (esperados ? esperados.includes(x.status) : x.status > 0 && x.status < 400) });
    if (p.capturar && res.status < 400) {
      const corpo = lerJson(res);
      for (const nome of Object.keys(p.capturar)) {
        const v = caminho(corpo, p.capturar[nome]);
        if (v !== undefined) variaveis[nome] = Array.isArray(v) ? sortear(v) : v;
      }
    }
    if (res.status === 0 || res.status >= 400) break;
    const pausa = p.pausa_s || [1, 3];
    sleep(pausa[0] + Math.random() * (pausa[1] - pausa[0]));
  }
}

export function disputa(dados) {
  const espera = (dados.largada - Date.now()) / 1000;
  if (espera > 0) sleep(espera);
  const cab = cabecalhosDoVu(dados, DISPUTA.conta);
  const r = montarRequisicao(DISPUTA.requisicao, cab, {});
  const res = http.request(r.metodo, r.url, r.corpo, {
    headers: r.cabecalhos,
    tags: { passo: `disputa.${DISPUTA.id}`, degrau: PLANO.degraus[0] },
    responseCallback: http.expectedStatuses({ min: 200, max: 499 }),
  });
  if (res.status >= 200 && res.status < 300) disputaSucessos.add(1);
  else disputaFalhas.add(1);
}

export function teardown(dados) {
  if (ETAPA !== 'disputa') return;
  const cab = DISPUTA.conta === 'nenhuma' || !dados.sessoes.length ? {} : dados.sessoes[0];
  const depois = medirVerificacao(DISPUTA.verificacao, cab);
  if (depois !== null && !Number.isNaN(depois)) disputaDepois.add(depois);
}

// ---------- resultado ----------

function valores(data, nome) {
  return data.metrics[nome] ? data.metrics[nome].values : null;
}

function limitesQuebrados(data) {
  const quebrados = [];
  for (const nome of Object.keys(data.metrics)) {
    const t = data.metrics[nome].thresholds;
    if (!t) continue;
    for (const expr of Object.keys(t)) if (!t[expr].ok && /http_req_failed/.test(nome)) quebrados.push(`${nome} ${expr}`);
  }
  return quebrados;
}

export function handleSummary(data) {
  const dur = valores(data, 'http_req_duration') || {};
  const falhas = valores(data, 'http_req_failed') || {};
  const reqs = valores(data, 'http_reqs') || {};
  const vus = valores(data, 'vus_max') || {};
  const iter = valores(data, 'iterations') || {};
  const recebidos = valores(data, 'data_received') || {};
  const checks = valores(data, 'checks') || {};

  const degraus = PLANO.degraus.map((d) => {
    const dd = valores(data, `http_req_duration{degrau:${d}}`) || {};
    const ff = valores(data, `http_req_failed{degrau:${d}}`) || {};
    const rr = valores(data, `http_reqs{degrau:${d}}`) || {};
    const medido = (rr.count || 0) > 0;
    return {
      vus: Number(d),
      medido,
      reqs: rr.count || 0,
      rps: rr.rate || 0,
      p50_ms: medido ? dd.med : null,
      p95_ms: medido ? dd['p(95)'] : null,
      p99_ms: medido ? dd['p(99)'] : null,
      max_ms: medido ? dd.max : null,
      taxa_erro: medido ? ff.rate || 0 : null,
      dentro_dos_limites: medido ? dd['p(95)'] < LIMITES.p95_ms && (ff.rate || 0) < LIMITES.taxa_erro : null,
    };
  });

  const passos = PASSOS.map((p) => {
    const dd = valores(data, `http_req_duration{passo:${p}}`) || {};
    const ff = valores(data, `http_req_failed{passo:${p}}`) || {};
    return { passo: p, p50_ms: dd.med ?? null, p95_ms: dd['p(95)'] ?? null, max_ms: dd.max ?? null, taxa_erro: ff.rate ?? null };
  });

  const quebrados = limitesQuebrados(data);
  let disputaResultado = null;
  if (ETAPA === 'disputa') {
    const antes = data.setup_data ? data.setup_data.antes : null;
    const depoisV = valores(data, 'disputa_depois');
    const depois = depoisV ? depoisV.value : null;
    const sucessos = (valores(data, 'disputa_sucessos') || {}).count || 0;
    const condicao = DISPUTA.verificacao ? DISPUTA.verificacao.condicao || {} : {};
    const violacoes = [];
    if (depois !== null && condicao.minimo !== undefined && depois < condicao.minimo) violacoes.push(`valor final ${depois} abaixo do mínimo ${condicao.minimo}`);
    if (depois !== null && condicao.maximo !== undefined && depois > condicao.maximo) violacoes.push(`valor final ${depois} acima do máximo ${condicao.maximo}`);
    if (DISPUTA.max_sucessos !== undefined && sucessos > DISPUTA.max_sucessos) violacoes.push(`${sucessos} requisições bem-sucedidas, máximo esperado ${DISPUTA.max_sucessos}`);
    // Sem estado inicial válido ou sem nenhum sucesso, a disputa não prova nada.
    const inconclusiva = [];
    if (antes === null || antes === undefined || Number.isNaN(antes)) inconclusiva.push('não foi possível medir o estado antes da disputa');
    else if (condicao.minimo !== undefined && antes <= condicao.minimo) inconclusiva.push(`o recurso já começou esgotado (valor antes = ${antes})`);
    if (sucessos === 0) inconclusiva.push('nenhuma requisição da disputa teve sucesso');
    disputaResultado = {
      id: DISPUTA.id,
      descricao: DISPUTA.descricao,
      usuarios: DISPUTA.usuarios || 50,
      sucessos,
      falhas: (valores(data, 'disputa_falhas') || {}).count || 0,
      verificacao_antes: antes,
      verificacao_depois: depois,
      violacoes,
      inconclusiva,
      passou: violacoes.length > 0 ? false : inconclusiva.length > 0 ? null : depois !== null,
    };
  }

  const resultado = {
    etapa: ETAPA,
    volume: VOLUME,
    gerado_em: new Date().toISOString(),
    base_url: BASE,
    parametros: ETAPA === 'disputa' ? { usuarios: DISPUTA.usuarios || 50 } : CONFIG,
    limites: LIMITES,
    interromper_se: PARAR,
    interrompido: quebrados.length > 0,
    limites_de_interrupcao_quebrados: quebrados,
    duracao_s: Math.round((data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs : 0) / 1000),
    erros_contas: data.setup_data ? data.setup_data.erros_contas : [],
    geral: {
      reqs: reqs.count || 0,
      rps: reqs.rate || 0,
      p50_ms: dur.med ?? null,
      p95_ms: dur['p(95)'] ?? null,
      p99_ms: dur['p(99)'] ?? null,
      max_ms: dur.max ?? null,
      taxa_erro: falhas.rate ?? null,
      vus_max: vus.max ?? vus.value ?? null,
      iteracoes: iter.count || 0,
      recebidos_bps: recebidos.rate || 0,
      checks_ok: checks.passes || 0,
      checks_falhos: checks.fails || 0,
    },
    degraus,
    passos,
    disputa: disputaResultado,
  };

  const linhas = degraus.map((d) =>
    ETAPA === 'disputa'
      ? `  ${String(d.vus).padStart(5)} usuários ao mesmo tempo  p95 ${Math.round(d.p95_ms)} ms`
      : d.medido
      ? `  ${String(d.vus).padStart(5)} VUs  p95 ${Math.round(d.p95_ms)} ms  erro ${(d.taxa_erro * 100).toFixed(2)}%  ${Math.round(d.rps)} req/s  ${d.dentro_dos_limites ? '✅' : '❌'}`
      : `  ${String(d.vus).padStart(5)} VUs  não alcançado`,
  );
  let texto = `\nprodtester · carga · etapa ${ETAPA}${VOLUME ? ` · volume ${VOLUME}` : ''}${resultado.interrompido ? ' · INTERROMPIDA' : ''}\n${linhas.join('\n')}\n`;
  if (disputaResultado) {
    const d = disputaResultado;
    const veredito = d.passou === true ? '✅' : d.passou === false ? `❌ ${d.violacoes.join('; ')}` : `⏸ inconclusiva: ${d.inconclusiva.join('; ')}`;
    texto += `  disputa ${d.id}: ${d.sucessos} sucessos, antes ${d.verificacao_antes}, depois ${d.verificacao_depois} ${veredito}\n`;
  }
  return { [SAIDA]: JSON.stringify(resultado, null, 2), stdout: texto };
}
