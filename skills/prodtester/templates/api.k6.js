// api.k6.js — testes de API gerados pelo prodtester.
//
// Executa, uma vez, cada caso descrito em casos-api.json e grava o resultado
// de cada um em JSON. Não é teste de carga: roda com 1 usuário virtual.
//
// Uso:
//   k6 run api.k6.js
//
// Variáveis de ambiente (todas opcionais):
//   PRODTESTER_CASOS      caminho do arquivo de casos (padrão ./casos-api.json)
//   PRODTESTER_SAIDA      arquivo de resultado (padrão ./resultado-api.json)
//   PRODTESTER_BASE_URL   substitui a base_url do arquivo de casos
//   PRODTESTER_SEGREDOS   arquivo .env com credenciais de teste
//   PRODTESTER_FALHAR     com 1, o k6 sai com erro se algum caso falhar (uso no CI)
// Credenciais também podem vir direto de variáveis de ambiente com o mesmo nome.
// Nenhum valor de credencial é gravado no resultado.

import http from 'k6/http';
import { check } from 'k6';

const CASOS = JSON.parse(open(__ENV.PRODTESTER_CASOS || './casos-api.json'));
const SAIDA = __ENV.PRODTESTER_SAIDA || './resultado-api.json';
const BASE = (__ENV.PRODTESTER_BASE_URL || CASOS.base_url || '').replace(/\/$/, '');
const TEMPO_LENTO = CASOS.tempo_lento_ms || 1000;
const SEGREDOS = carregarSegredos(__ENV.PRODTESTER_SEGREDOS);
const MENSAGEM_GENERICA = /^\s*(erro|error|bad request|algo deu errado|ocorreu um erro|internal server error|falha|invalid|inválido)[.!]?\s*$/i;
const RASTRO_TECNICO = /(TypeError|ReferenceError|SyntaxError|Exception|Traceback|\n\s+at |stack|SQLSTATE|ORA-\d|ECONNREFUSED|undefined is not)/i;

export const options = {
  vus: 1,
  iterations: 1,
  setupTimeout: '15m',
  summaryTrendStats: ['min', 'med', 'p(95)', 'max'],
  thresholds: __ENV.PRODTESTER_FALHAR === '1' ? { checks: ['rate==1'] } : {},
};

function carregarSegredos(caminho) {
  const valores = {};
  if (!caminho) return valores;
  for (const linha of open(caminho).split('\n')) {
    const m = linha.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    valores[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return valores;
}

function segredo(nome) {
  const valor = SEGREDOS[nome] !== undefined ? SEGREDOS[nome] : __ENV[nome];
  if (valor === undefined || valor === '') throw new Error(`credencial ${nome} não definida`);
  return valor;
}

function esconderSegredos(texto) {
  let resultado = String(texto);
  const valores = Object.values(SEGREDOS).concat(Object.keys(__ENV).filter((k) => k.startsWith('PRODTESTER_')).map((k) => __ENV[k]));
  for (const v of valores) {
    if (v && v.length >= 4) resultado = resultado.split(v).join('«omitido»');
  }
  return resultado;
}

// Troca {{variavel}}, {{segredo:NOME}} e {{aleatorio}} em textos e objetos.
function substituir(valor, variaveis) {
  if (typeof valor === 'string') {
    const inteiro = valor.match(/^\{\{([^}]+)\}\}$/);
    if (inteiro && !inteiro[1].startsWith('segredo:') && inteiro[1] !== 'aleatorio' && variaveis[inteiro[1]] !== undefined) {
      return variaveis[inteiro[1]];
    }
    return valor.replace(/\{\{([^}]+)\}\}/g, (_, chave) => {
      if (chave.startsWith('segredo:')) return segredo(chave.slice(8));
      if (chave === 'aleatorio') return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
      if (chave.startsWith('repetir:')) {
        const [, texto, vezes] = chave.split(':');
        return texto.repeat(Number(vezes));
      }
      if (variaveis[chave] === undefined) throw new Error(`variável {{${chave}}} sem valor (um caso anterior falhou?)`);
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

function caminho(objeto, rota) {
  return rota.split('.').reduce((atual, parte) => (atual == null ? undefined : atual[parte]), objeto);
}

function lerJson(res) {
  try {
    return res.json();
  } catch (_) {
    return undefined;
  }
}

function cabecalhosDaConta(nomeConta, sessoes) {
  if (!nomeConta || nomeConta === 'nenhuma') return {};
  if (nomeConta === 'invalida') return { Authorization: 'Bearer token-invalido-prodtester' };
  const sessao = sessoes[nomeConta];
  if (!sessao) throw new Error(`conta ${nomeConta} sem sessão (login falhou ou conta não declarada)`);
  return sessao;
}

function montarSessao(conta) {
  const tipo = conta.tipo || 'bearer';
  if (tipo === 'bearer') return { Authorization: `Bearer ${segredo(conta.token_env)}` };
  if (tipo === 'cabecalho') return { [conta.cabecalho]: segredo(conta.token_env) };
  if (tipo === 'cookie') return { Cookie: segredo(conta.token_env) };
  if (tipo === 'login') {
    const login = substituir(conta.login, {});
    const res = http.request(login.metodo || 'POST', BASE + login.rota, JSON.stringify(login.corpo || {}), {
      headers: { 'Content-Type': 'application/json' },
      tags: { prodtester: 'login' },
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`login da conta falhou com status ${res.status}`);
    if (login.extrair_cookie) {
      const cookies = res.cookies || {};
      const nome = login.extrair_cookie;
      if (!cookies[nome] || !cookies[nome][0]) throw new Error(`login não devolveu o cookie ${nome}`);
      return { Cookie: `${nome}=${cookies[nome][0].value}` };
    }
    const token = caminho(lerJson(res), login.extrair || 'token');
    if (!token) throw new Error(`login não devolveu o campo ${login.extrair || 'token'}`);
    SEGREDOS[`__token_${Math.random()}`] = String(token);
    return login.tipo === 'cabecalho' ? { [login.cabecalho]: String(token) } : { Authorization: `Bearer ${token}` };
  }
  throw new Error(`tipo de conta desconhecido: ${tipo}`);
}

function enviar(req, cabecalhosConta, variaveis) {
  const r = substituir(req, variaveis);
  const metodo = (r.metodo || 'GET').toUpperCase();
  const cabecalhos = Object.assign({}, cabecalhosConta, r.cabecalhos || {});
  let corpo = null;
  if (r.corpo_bruto !== undefined) corpo = r.corpo_bruto;
  else if (r.corpo !== undefined) {
    corpo = JSON.stringify(r.corpo);
    if (!cabecalhos['Content-Type']) cabecalhos['Content-Type'] = 'application/json';
  }
  return { metodo, url: BASE + r.rota, corpo, cabecalhos };
}

function avaliar(caso, res, esperado) {
  const falhas = [];
  const status = res.status;
  if (status === 0) falhas.push(`sem resposta (${res.error || 'erro de rede'})`);
  if (status >= 500) falhas.push(`erro ${status} no servidor`);
  if (esperado.status && !esperado.status.includes(status)) falhas.push(`status ${status}, esperado ${esperado.status.join(' ou ')}`);
  if (esperado.status_faixa && !(status >= esperado.status_faixa[0] && status <= esperado.status_faixa[1])) {
    falhas.push(`status ${status}, esperado entre ${esperado.status_faixa[0]} e ${esperado.status_faixa[1]}`);
  }
  const corpo = lerJson(res);
  if (esperado.json) {
    const tipo = String(res.headers['Content-Type'] || '');
    if (!tipo.includes('json') || corpo === undefined) falhas.push('resposta não é JSON válido');
  }
  for (const campo of esperado.campos || []) {
    if (caminho(corpo, campo) === undefined) falhas.push(`campo "${campo}" ausente na resposta`);
  }
  if (esperado.max_itens !== undefined) {
    const lista = Array.isArray(corpo) ? corpo : caminho(corpo, esperado.lista || 'items');
    if (Array.isArray(lista) && lista.length > esperado.max_itens) falhas.push(`devolveu ${lista.length} itens, limite esperado ${esperado.max_itens}`);
  }
  if (esperado.mensagem_util) {
    const texto = corpo !== undefined
      ? [caminho(corpo, 'message'), caminho(corpo, 'mensagem'), caminho(corpo, 'erro'), caminho(corpo, 'error'), caminho(corpo, 'detail'), caminho(corpo, 'errors')]
          .filter((v) => v !== undefined)
          .map((v) => (typeof v === 'string' ? v : JSON.stringify(v)))
          .join(' ')
      : String(res.body || '');
    if (!texto || texto.trim().length < 12 || MENSAGEM_GENERICA.test(texto)) falhas.push('mensagem de erro inútil ou ausente');
  }
  if (RASTRO_TECNICO.test(String(res.body || ''))) falhas.push('resposta expõe detalhe técnico interno');
  return falhas;
}

function registro(caso, res, falhas, extra) {
  const tempo = res ? Math.round(res.timings.duration) : null;
  return Object.assign(
    {
      id: caso.id,
      endpoint: caso.endpoint,
      tipo: caso.tipo,
      descricao: caso.descricao,
      conta: caso.conta || 'nenhuma',
      esperado: caso.esperado || {},
      obtido: res
        ? {
            status: res.status,
            tempo_ms: tempo,
            corpo_trecho: esconderSegredos(String(res.body || '').slice(0, 300)),
          }
        : null,
      lento: tempo !== null && tempo > (caso.esperado && caso.esperado.max_tempo_ms ? caso.esperado.max_tempo_ms : TEMPO_LENTO),
      passou: falhas.length === 0,
      falhas,
    },
    extra || {},
  );
}

function executarCaso(caso, sessoes, variaveis) {
  const esperado = caso.esperado || {};
  const cab = cabecalhosDaConta(caso.conta, sessoes);

  if (caso.tipo === 'idempotencia') {
    const pedido = enviar(caso.requisicao, cab, variaveis);
    const vezes = caso.repeticoes || 4;
    const lote = [];
    for (let i = 0; i < vezes; i += 1) {
      lote.push({ method: pedido.metodo, url: pedido.url, body: pedido.corpo, params: { headers: pedido.cabecalhos, tags: { prodtester: caso.id } } });
    }
    const respostas = caso.simultaneo === false ? lote.map((l) => http.request(l.method, l.url, l.body, l.params)) : http.batch(lote);
    const campoId = esperado.campo_id || 'id';
    const ids = {};
    let sucessos = 0;
    for (const r of respostas) {
      if (r.status >= 200 && r.status < 300) {
        sucessos += 1;
        const id = caminho(lerJson(r), campoId);
        if (id !== undefined) ids[String(id)] = true;
      }
    }
    const criados = Object.keys(ids).length || sucessos;
    const falhas = [];
    if (respostas.some((r) => r.status >= 500)) falhas.push('erro 5xx durante as repetições');
    if (criados > (esperado.max_criados !== undefined ? esperado.max_criados : 1)) falhas.push(`${vezes} envios criaram ${criados} registros`);
    const maisLenta = respostas.reduce((a, b) => (a.timings.duration >= b.timings.duration ? a : b));
    check(maisLenta, { [`${caso.id} idempotente`]: () => falhas.length === 0 });
    return registro(caso, maisLenta, falhas, {
      repeticoes: vezes,
      criados,
      status_respostas: respostas.map((r) => r.status),
    });
  }

  const pedido = enviar(caso.requisicao, cab, variaveis);
  const res = http.request(pedido.metodo, pedido.url, pedido.corpo, { headers: pedido.cabecalhos, tags: { prodtester: caso.id } });
  const falhas = avaliar(caso, res, esperado);
  check(res, { [`${caso.id} ${caso.tipo}`]: () => falhas.length === 0 });
  if (caso.capturar && res.status >= 200 && res.status < 300) {
    const corpo = lerJson(res);
    for (const nome of Object.keys(caso.capturar)) {
      const valor = caminho(corpo, caso.capturar[nome]);
      if (valor !== undefined) variaveis[nome] = valor;
    }
  }
  return registro(caso, res, falhas);
}

export function setup() {
  const sessoes = {};
  const erros_contas = {};
  for (const nome of Object.keys(CASOS.contas || {})) {
    try {
      sessoes[nome] = montarSessao(CASOS.contas[nome]);
    } catch (e) {
      erros_contas[nome] = String(e.message || e);
    }
  }
  const variaveis = Object.assign({}, CASOS.variaveis || {});
  const resultados = [];
  for (const caso of CASOS.casos || []) {
    try {
      resultados.push(executarCaso(caso, sessoes, variaveis));
    } catch (e) {
      check(null, { [`${caso.id} executou`]: () => false });
      resultados.push({
        id: caso.id,
        endpoint: caso.endpoint,
        tipo: caso.tipo,
        descricao: caso.descricao,
        conta: caso.conta || 'nenhuma',
        esperado: caso.esperado || {},
        obtido: null,
        lento: false,
        passou: false,
        nao_executado: true,
        falhas: [esconderSegredos(String(e.message || e))],
      });
    }
  }
  return { resultados, erros_contas };
}

export default function () {}

export function handleSummary(data) {
  const dados = data.setup_data || { resultados: [], erros_contas: {} };
  const r = dados.resultados;
  const resumo = {
    casos: r.length,
    passaram: r.filter((x) => x.passou).length,
    falharam: r.filter((x) => !x.passou && !x.nao_executado).length,
    nao_executados: r.filter((x) => x.nao_executado).length,
    lentos: r.filter((x) => x.lento).length,
  };
  const saida = {
    gerado_em: new Date().toISOString(),
    base_url: BASE,
    tempo_lento_ms: TEMPO_LENTO,
    resumo,
    erros_contas: dados.erros_contas,
    casos: r,
    k6: {
      http_req_duration: data.metrics.http_req_duration ? data.metrics.http_req_duration.values : null,
      http_reqs: data.metrics.http_reqs ? data.metrics.http_reqs.values.count : null,
    },
  };
  const linhas = r.map((x) => `${x.passou ? '✅' : x.nao_executado ? '— ' : '❌'} ${x.id} ${x.endpoint} [${x.tipo}]${x.lento ? ' ⏱' : ''}${x.passou ? '' : ` — ${x.falhas.join('; ')}`}`);
  const texto = `\nprodtester · testes de API\n${linhas.join('\n')}\n\n${resumo.passaram}/${resumo.casos} passaram · ${resumo.falharam} falharam · ${resumo.nao_executados} não executados · ${resumo.lentos} lentos\n`;
  return { [SAIDA]: JSON.stringify(saida, null, 2), stdout: texto };
}
