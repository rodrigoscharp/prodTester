#!/usr/bin/env node
// Lista os endpoints de uma especificação OpenAPI/Swagger em JSON.
//
// Uso:
//   node openapi-endpoints.mjs <arquivo.json | URL>
//
// Imprime uma lista JSON com método, rota, se exige autenticação, parâmetros,
// campos obrigatórios do corpo e respostas documentadas. Especificações em
// YAML precisam ser lidas diretamente.

import { readFileSync } from 'node:fs';

const origem = process.argv[2];
if (!origem) {
  console.error('uso: node openapi-endpoints.mjs <arquivo.json | URL>');
  process.exit(1);
}

let texto;
if (/^https?:\/\//.test(origem)) {
  const resposta = await fetch(origem);
  if (!resposta.ok) {
    console.error(`openapi: ${origem} respondeu ${resposta.status}`);
    process.exit(1);
  }
  texto = await resposta.text();
} else {
  texto = readFileSync(origem, 'utf8');
}

let spec;
try {
  spec = JSON.parse(texto);
} catch {
  console.error('openapi: o conteúdo não é JSON. Para YAML, leia o arquivo diretamente.');
  process.exit(1);
}

const resolver = (ref) => ref.replace(/^#\//, '').split('/').reduce((o, p) => o?.[p], spec);
const expandir = (schema) => (schema?.$ref ? resolver(schema.$ref) : schema);

const segurancaGlobal = spec.security ?? [];
const METODOS = ['get', 'post', 'put', 'patch', 'delete'];
const endpoints = [];

for (const [rota, item] of Object.entries(spec.paths ?? {})) {
  for (const metodo of METODOS) {
    const op = item[metodo];
    if (!op) continue;
    const seguranca = op.security ?? segurancaGlobal;
    const corpo = expandir(op.requestBody?.content?.['application/json']?.schema);
    endpoints.push({
      metodo: metodo.toUpperCase(),
      rota: rota.replace(/\{([^}]+)\}/g, ':$1'),
      resumo: op.summary ?? null,
      autenticacao: seguranca.length > 0 && !seguranca.every((s) => Object.keys(s).length === 0),
      parametros: [...(item.parameters ?? []), ...(op.parameters ?? [])].map((p) => {
        const param = p.$ref ? resolver(p.$ref) : p;
        return { nome: param.name, em: param.in, obrigatorio: Boolean(param.required) };
      }),
      corpo_obrigatorios: corpo?.required ?? [],
      corpo_campos: Object.keys(corpo?.properties ?? {}),
      respostas: Object.keys(op.responses ?? {}),
    });
  }
}

console.log(JSON.stringify(endpoints, null, 2));
