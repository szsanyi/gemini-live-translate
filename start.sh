#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"
PID_FILE="$RUN_DIR/live-translate.pid"
LOG_FILE="$RUN_DIR/live-translate.log"
PORT="${PORT:-3000}"

mkdir -p "$RUN_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if [[ -n "$EXISTING_PID" ]] && kill -0 "$EXISTING_PID" 2>/dev/null; then
    echo "Az alkalmazás már fut (PID: $EXISTING_PID)."
    echo "Log: $LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo "Hiányzik a .env fájl."
  echo "Hozd létre a .env.example alapján, és állítsd be a GEMINI_API_KEY értékét."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Hiányzik a node_modules könyvtár."
  echo "Telepítsd a függőségeket: npm install"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/node_modules/tsx" ]]; then
  echo "A tsx csomag nem található a projektben."
  echo "Telepítsd újra a függőségeket: npm install"
  exit 1
fi

cd "$ROOT_DIR"

echo "Build indítása..." >>"$LOG_FILE"
npm run build >>"$LOG_FILE" 2>&1

nohup env NODE_ENV=production node --loader tsx server.ts >>"$LOG_FILE" 2>&1 &
APP_PID=$!
echo "$APP_PID" >"$PID_FILE"

sleep 2

if kill -0 "$APP_PID" 2>/dev/null; then
  echo "Az alkalmazás elindult."
  echo "PID: $APP_PID"
  echo "Port: $PORT"
  echo "Log: $LOG_FILE"
  exit 0
fi

rm -f "$PID_FILE"
echo "Az alkalmazás nem indult el. Ellenőrizd a logot: $LOG_FILE"
exit 1
