#!/usr/bin/env bash
# Verifica as dependências do prodtester e imprime uma linha por item.
# Sempre termina com código 0: o resultado é informativo e é injetado no
# SKILL.md ao carregar a skill, onde uma falha abortaria a invocação.

linha() { printf -- '- %s: %s\n' "$1" "$2"; }

if command -v node >/dev/null 2>&1; then
  linha "node" "$(node --version 2>/dev/null)"
else
  linha "node" "ausente (necessário para o Playwright MCP e os scripts do relatório)"
fi

if command -v k6 >/dev/null 2>&1; then
  linha "k6" "local $(k6 version 2>/dev/null | head -n 1)"
elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  linha "k6" "via docker (imagem grafana/k6)"
elif command -v docker >/dev/null 2>&1; then
  linha "k6" "ausente; docker instalado mas parado (abra o Docker para usar a imagem grafana/k6)"
else
  linha "k6" "ausente (instale o k6 ou o Docker para os modos api e carga)"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  linha "docker" "rodando"
elif command -v docker >/dev/null 2>&1; then
  linha "docker" "instalado, parado"
else
  linha "docker" "ausente"
fi

navegador="ausente"
for caminho in \
  "/Applications/Google Chrome.app" \
  "$HOME/Applications/Google Chrome.app"; do
  [ -d "$caminho" ] && navegador="Google Chrome"
done
for bin in google-chrome google-chrome-stable chrome; do
  command -v "$bin" >/dev/null 2>&1 && navegador="Google Chrome"
done
if [ "$navegador" = "ausente" ] && [ -d "$HOME/Library/Caches/ms-playwright" -o -d "$HOME/.cache/ms-playwright" ]; then
  navegador="navegadores do Playwright instalados (sem Google Chrome)"
fi
linha "navegador das personas" "$navegador"

case "${PRODTESTER_HEADLESS:-false}" in
  true|1) linha "modo dos navegadores" "invisível (PRODTESTER_HEADLESS=${PRODTESTER_HEADLESS})" ;;
  *)      linha "modo dos navegadores" "visível" ;;
esac

if [ -f "testes-fluxos.yaml" ]; then
  linha "testes-fluxos.yaml" "encontrado"
else
  linha "testes-fluxos.yaml" "não encontrado (o prodtester vai deduzir e perguntar)"
fi

if [ -f "auditoria/ultima.txt" ]; then
  linha "última auditoria" "auditoria/$(head -n 1 auditoria/ultima.txt)"
else
  linha "última auditoria" "nenhuma"
fi

exit 0
