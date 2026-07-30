#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.run/live-translate.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "Nem található PID fájl, az alkalmazás valószínűleg nem fut."
  exit 0
fi

APP_PID="$(cat "$PID_FILE")"

if [[ -z "$APP_PID" ]]; then
  rm -f "$PID_FILE"
  echo "A PID fájl üres volt, töröltem."
  exit 0
fi

if ! kill -0 "$APP_PID" 2>/dev/null; then
  rm -f "$PID_FILE"
  echo "A folyamat már nem futott, a PID fájlt töröltem."
  exit 0
fi

kill "$APP_PID"

for _ in {1..10}; do
  if ! kill -0 "$APP_PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Az alkalmazás leállt."
    exit 0
  fi
  sleep 1
done

kill -9 "$APP_PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "Az alkalmazás kényszerítve lett leállítva."
