#!/usr/bin/env node
// Registra falas e passos das personas.
//
// Cada chamada é um comando simples (sem pipe, heredoc ou redirecionamento),
// para caber numa única regra de permissão do Claude Code.
//
// Uso:
//   node registrar.mjs <pasta-da-persona> fala <tipo> <texto...>
//   node registrar.mjs <pasta-da-persona> passo '<json do passo>' [<tipo> <texto...>]
//   node registrar.mjs <pasta-da-persona> requisicao '<json de uma requisição>'
//   node registrar.mjs <pasta-da-persona> resumo '<json do resumo>'
//
// <pasta-da-persona> é auditoria/<execucao>/personas/<id> e precisa ter o
// persona.md com o cabeçalho da persona (id, nome, emoji, cor).
// A fala vai para auditoria/<execucao>/narrativa.jsonl.
// O passo vai para <pasta-da-persona>/passos.jsonl.
// A requisição é acrescentada à lista em <pasta-da-persona>/requisicoes.json.
// O resumo substitui <pasta-da-persona>/resumo.json.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const TIPOS = ['inicio', 'acao', 'pensamento', 'problema', 'abandono', 'sucesso', 'fim'];
const LIMITE_FALA = 280;

function sair(mensagem) {
  console.error(`registrar: ${mensagem}`);
  process.exit(1);
}

function lerCabecalho(arquivo) {
  let conteudo;
  try {
    conteudo = readFileSync(arquivo, 'utf8');
  } catch {
    sair(`não encontrei ${arquivo}`);
  }
  const bloco = conteudo.match(/^---\n([\s\S]*?)\n---/);
  if (!bloco) sair(`${arquivo} não tem cabeçalho entre ---`);
  const campos = {};
  for (const linha of bloco[1].split('\n')) {
    const m = linha.match(/^([a-z_]+):\s*(.*)$/);
    if (m) campos[m[1]] = m[2].trim();
  }
  return campos;
}

function registrarFala(pasta, tipo, partes) {
  if (!TIPOS.includes(tipo)) sair(`tipo de fala inválido "${tipo}". Use: ${TIPOS.join(', ')}`);
  let texto = partes.join(' ').replace(/\s+/g, ' ').trim();
  if (!texto) sair('texto da fala vazio');
  if (texto.length > LIMITE_FALA) texto = `${texto.slice(0, LIMITE_FALA - 1)}…`;
  const persona = lerCabecalho(join(pasta, 'persona.md'));
  const fala = {
    t: new Date().toISOString(),
    persona: persona.id,
    nome: persona.nome,
    emoji: persona.emoji,
    cor: persona.cor,
    tipo,
    texto,
  };
  appendFileSync(join(pasta, '..', '..', 'narrativa.jsonl'), `${JSON.stringify(fala)}\n`);
  console.log(`${fala.emoji} ${fala.nome} › ${fala.texto}`);
}

function lerObjeto(json, nome) {
  let objeto;
  try {
    objeto = JSON.parse(json);
  } catch (erro) {
    sair(`JSON ${nome} inválido: ${erro.message}`);
  }
  if (typeof objeto !== 'object' || objeto === null || Array.isArray(objeto)) sair(`${nome} precisa ser um objeto JSON`);
  return objeto;
}

const SENSIVEL = /senha|password|passwd|^pass$|token|secret|chave|api[-_]?key|^key$|cpf|cart[aã]o|card|authorization|cookie/i;

function omitirSensiveis(valor) {
  if (Array.isArray(valor)) return valor.map(omitirSensiveis);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor).map(([campo, v]) => [campo, SENSIVEL.test(campo) ? '«omitido»' : omitirSensiveis(v)]),
    );
  }
  return valor;
}

function registrarRequisicao(pasta, json) {
  const requisicao = omitirSensiveis(lerObjeto(json, 'da requisição'));
  const arquivo = join(pasta, 'requisicoes.json');
  const lista = existsSync(arquivo) ? JSON.parse(readFileSync(arquivo, 'utf8')) : [];
  lista.push(requisicao);
  writeFileSync(arquivo, `${JSON.stringify(lista, null, 2)}\n`);
  console.log(`requisição ${requisicao.metodo ?? ''} ${requisicao.rota ?? ''} registrada`.trim());
}

function registrarResumo(pasta, json) {
  const resumo = lerObjeto(json, 'do resumo');
  writeFileSync(join(pasta, 'resumo.json'), `${JSON.stringify(resumo, null, 2)}\n`);
  console.log('resumo registrado');
}

function registrarPasso(pasta, json) {
  const passo = lerObjeto(json, 'do passo');
  if (!passo.t) passo.t = new Date().toISOString();
  appendFileSync(join(pasta, 'passos.jsonl'), `${JSON.stringify(passo)}\n`);
  console.log(`passo ${passo.n ?? '?'} registrado`);
}

const [pastaArg, comando, ...resto] = process.argv.slice(2);
if (!pastaArg || !comando) sair('uso: node registrar.mjs <pasta-da-persona> fala|passo|requisicao|resumo ...');
const pasta = resolve(pastaArg);

if (comando === 'fala') {
  const [tipo, ...texto] = resto;
  registrarFala(pasta, tipo, texto);
} else if (comando === 'passo') {
  const [json, tipo, ...texto] = resto;
  if (!json) sair('faltou o JSON do passo');
  registrarPasso(pasta, json);
  if (tipo) registrarFala(pasta, tipo, texto);
} else if (comando === 'requisicao') {
  if (!resto[0]) sair('faltou o JSON da requisição');
  registrarRequisicao(pasta, resto[0]);
} else if (comando === 'resumo') {
  if (!resto[0]) sair('faltou o JSON do resumo');
  registrarResumo(pasta, resto[0]);
} else {
  sair(`comando desconhecido "${comando}". Use fala, passo, requisicao ou resumo.`);
}
