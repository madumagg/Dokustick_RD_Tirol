#!/bin/bash
# Kompiliert und startet den Test der deutschen Tastaturbelegung (braucht gcc).
set -euo pipefail
cd "$(dirname "$0")"
out=$(mktemp)
gcc -Wall -Istub -I../../firmware/src -o "$out" keymap_test.c ../../firmware/src/keymap_de.c
"$out"
rm -f "$out"
