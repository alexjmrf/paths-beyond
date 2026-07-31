#!/usr/bin/env bash
# PreToolUse hook: bloqueia escrita de código não determinístico em packages/core.
# Recebe o payload do hook em stdin (JSON). Sai com código 2 para bloquear.
payload=$(cat)
path=$(printf '%s' "$payload" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')

case "$path" in
  *packages/core/*)
    if printf '%s' "$payload" | grep -qE 'Math\.random|Date\.now|new Date\(|performance\.now'; then
      echo "BLOQUEADO: packages/core precisa ser determinístico. Use rngFor() em vez de Math.random, e nunca leia o relógio. Ver CLAUDE.md regra 1." >&2
      exit 2
    fi
    ;;
esac
exit 0
