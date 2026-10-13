#!/usr/bin/env bash
# Roda uma etapa do teste de carga, com as travas de segurança do prodtester
# e o monitor da máquina geradora.
#
# Uso:
#   bash rodar-carga.sh --base <url> <pasta-execucao> <etapa> [--disputa <id>] [--volume <rótulo>]
#                       [--container <nome>] [--pid <pid>]
#
# Etapas: smoke | esperada | estresse | pico | resistencia | responsividade | disputa
#
# Antes de rodar, confere em <execucao>/contexto.json que:
#   - a carga foi confirmada nesta execução (carga.confirmado_nesta_execucao = true);
#   - o ambiente é local ou staging (alvo.ambiente);
#   - o ambiente não compartilha recursos com produção (carga.isolado_de_producao = true).
# Grava carga/<etapa>[-<rótulo>].json e carga/maquina-<etapa>[-<rótulo>].json.

set -euo pipefail

aqui="$(cd "$(dirname "$0")" && pwd)"
base=""
disputa=""
volume=""
monitor_args=()
posicionais=()

while [ $# -gt 0 ]; do
  case "$1" in
    --base) base="$2"; shift 2 ;;
    --disputa) disputa="$2"; shift 2 ;;
    --volume) volume="$2"; shift 2 ;;
    --container) monitor_args+=(--container "$2"); shift 2 ;;
    --pid) monitor_args+=(--pid "$2"); shift 2 ;;
    *) posicionais+=("$1"); shift ;;
  esac
done

if [ ${#posicionais[@]} -ne 2 ] || [ -z "$base" ]; then
  echo "uso: bash rodar-carga.sh --base <url> <pasta-execucao> <etapa> [--disputa <id>] [--volume <rótulo>] [--container <nome>] [--pid <pid>]" >&2
  exit 2
fi

execucao="$(cd "${posicionais[0]}" && pwd)"
etapa="${posicionais[1]}"

case "$etapa" in
  smoke|esperada|estresse|pico|resistencia|responsividade|disputa) ;;
  *) echo "rodar-carga: etapa inválida: $etapa" >&2; exit 2 ;;
esac
if [ "$etapa" = "disputa" ] && [ -z "$disputa" ]; then
  echo "rodar-carga: a etapa disputa exige --disputa <id>" >&2
  exit 2
fi

# Travas de segurança, lidas do contexto da execução.
node -e '
const fs = require("fs");
const [arquivo, base] = process.argv.slice(1);
let c;
try { c = JSON.parse(fs.readFileSync(arquivo, "utf8")); }
catch (e) { console.error("rodar-carga: contexto.json ausente ou inválido em " + arquivo); process.exit(1); }
const falhas = [];
if (!c.carga || c.carga.confirmado_nesta_execucao !== true) falhas.push("a carga não foi confirmada pelo usuário nesta execução (carga.confirmado_nesta_execucao)");
if (!c.carga || c.carga.isolado_de_producao !== true) falhas.push("não está registrado que o ambiente é isolado de produção (carga.isolado_de_producao)");
const amb = c.alvo && c.alvo.ambiente;
if (amb !== "local" && amb !== "staging") falhas.push("o ambiente alvo não é local nem staging (alvo.ambiente = " + amb + ")");
const host = (() => { try { return new URL(base).host; } catch { return null; } })();
const hostContexto = (() => { try { return new URL(c.alvo.url).host; } catch { return null; } })();
if (!host || host !== hostContexto) falhas.push("a URL --base (" + base + ") não é o alvo registrado no contexto (" + (c.alvo && c.alvo.url) + ")");
if (falhas.length) { console.error("rodar-carga: carga bloqueada:\n  - " + falhas.join("\n  - ")); process.exit(1); }
' "$execucao/contexto.json" "$base"

if [ ! -f "$execucao/testes/carga.k6.js" ] || [ ! -f "$execucao/testes/cenario-carga.json" ]; then
  echo "rodar-carga: faltam testes/carga.k6.js ou testes/cenario-carga.json em $execucao" >&2
  exit 2
fi

mkdir -p "$execucao/carga"
sufixo="$etapa"
[ -n "$disputa" ] && sufixo="$etapa-$disputa"
[ -n "$volume" ] && sufixo="$sufixo-$volume"

export PRODTESTER_ETAPA="$etapa"
[ -n "$disputa" ] && export PRODTESTER_DISPUTA="$disputa"
[ -n "$volume" ] && export PRODTESTER_VOLUME="$volume"

node "$aqui/monitorar-maquina.mjs" "$execucao/carga/maquina-$sufixo.json" ${monitor_args[@]+"${monitor_args[@]}"} &
monitor=$!
trap 'kill -TERM "$monitor" 2>/dev/null || true; wait "$monitor" 2>/dev/null || true' EXIT

set +e
bash "$aqui/rodar-k6.sh" --base "$base" --saida "carga/$sufixo.json" "$execucao" testes/carga.k6.js
codigo=$?
set -e

# k6 sai com 99 quando um limite de interrupção é quebrado: é um resultado, não uma falha do script.
if [ "$codigo" -eq 99 ]; then
  echo "rodar-carga: etapa $etapa interrompida pelo limite de erro (resultado gravado em carga/$sufixo.json)"
  exit 0
fi
exit "$codigo"
