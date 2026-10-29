#!/bin/bash
# Kompiliert und startet den Test der deutschen Tastaturbelegung (braucht gcc).
# Die Firmware liegt im Repository rdprotopilot/firmware:
#   tests/firmware/run.sh [Pfad zum Firmware-Klon]   (Standard: ../firmware neben diesem Repository)
set -euo pipefail
cd "$(dirname "$0")"
fw="${1:-${FIRMWARE_DIR:-../../../firmware}}"
if [ ! -f "$fw/src/keymap_de.c" ]; then
  echo "Firmware nicht gefunden unter $fw (erwartet: $fw/src/keymap_de.c)."
  echo "Klonen: git clone https://github.com/rdprotopilot/firmware ../firmware (neben diesem Repository)"
  exit 1
fi
out=$(mktemp)
gcc -Wall -Istub -I"$fw/src" -o "$out" keymap_test.c "$fw/src/keymap_de.c"
"$out"
rm -f "$out"
