#!/usr/bin/env bash
# Roda um script k6 com o k6 local ou, se não houver, com a imagem Docker oficial.
#
# Uso:
#   bash rodar-k6.sh [--base <url>] [--saida <arquivo>] <pasta-de-trabalho> <script.js> [argumentos do k6 run]
#
# <pasta-de-trabalho> é o diretório de execução do k6; o script fica dentro
# dela (pode estar numa subpasta) e os arquivos de saída são gravados nela.
# --base vira PRODTESTER_BASE_URL e --saida vira PRODTESTER_SAIDA.
# Variáveis PRODTESTER_* do ambiente são repassadas ao k6. Com Docker, a URL
# base com localhost é trocada por host.docker.internal e o arquivo de
# PRODTESTER_SEGREDOS é montado só para leitura.

set -euo pipefail

IMAGEM="grafana/k6:2.3.0"

while [ $# -gt 0 ]; do
  case "$1" in
    --base) export PRODTESTER_BASE_URL="$2"; shift 2 ;;
    --saida) export PRODTESTER_SAIDA="$2"; shift 2 ;;
    *) break ;;
  esac
done

if [ $# -lt 2 ]; then
  echo "uso: bash rodar-k6.sh [--base <url>] [--saida <arquivo>] <pasta-de-trabalho> <script.js> [argumentos do k6]" >&2
  exit 2
fi

pasta="$(cd "$1" && pwd)"
script="$2"
shift 2

if [ ! -f "$pasta/$script" ]; then
  echo "rodar-k6: $pasta/$script não existe" >&2
  exit 2
fi

if command -v k6 >/dev/null 2>&1; then
  cd "$pasta"
  exec k6 run "$@" "$script"
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "rodar-k6: k6 não encontrado e Docker indisponível. Instale o k6 (https://grafana.com/docs/k6/latest/set-up/install-k6/) ou abra o Docker." >&2
  exit 3
fi

args=(run --rm -i --add-host=host.docker.internal:host-gateway -v "$pasta:/work" -w /work)

for var in $(env | grep -o '^PRODTESTER_[A-Z0-9_]*' || true); do
  case "$var" in
    PRODTESTER_SEGREDOS) ;;
    PRODTESTER_BASE_URL) ;;
    *) args+=(-e "$var") ;;
  esac
done

if [ -n "${PRODTESTER_SEGREDOS:-}" ]; then
  args+=(-v "$PRODTESTER_SEGREDOS:/segredos.env:ro" -e PRODTESTER_SEGREDOS=/segredos.env)
fi

if [ -n "${PRODTESTER_BASE_URL:-}" ]; then
  base="${PRODTESTER_BASE_URL//localhost/host.docker.internal}"
  base="${base//127.0.0.1/host.docker.internal}"
  args+=(-e "PRODTESTER_BASE_URL=$base")
fi

exec docker "${args[@]}" "$IMAGEM" run "$@" "$script"
