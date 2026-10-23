#!/bin/bash
# Setzt die App-Version an allen Stellen (Offline-Speicher, Datei-Adressen, Anzeige).
#
#   tools/version.sh          naechste Version (0.18 -> 0.19)
#   tools/version.sh 1.0      bestimmte Version setzen (z.B. fuer die fertige 1.0)
#
# Schema: 0.x = in Entwicklung, ab 1.0 fertiges Produkt.
set -euo pipefail
cd "$(dirname "$0")/../webapp"

current=$(sed -nE "s/^const APP_VERSION = '([0-9.]+)';/\1/p" app.js)
if [ $# -eq 0 ]; then
  # letzte Stelle um eins erhoehen
  next="${current%.*}.$(( ${current##*.} + 1 ))"
elif [[ "$1" =~ ^[0-9]+\.[0-9]+$ ]]; then
  next="$1"
else
  echo "Aufruf: $0 [Version, z.B. 0.19 oder 1.0]"; exit 1
fi

sed -i -E "s/^const VERSION = '[0-9.]+';/const VERSION = '$next';/" sw.js
sed -i -E "s/^const APP_VERSION = '[0-9.]+';/const APP_VERSION = '$next';/" app.js
sed -i -E "s/\.js\?v=[0-9.]+\"/.js?v=$next\"/g" index.html
echo "Version $current -> $next"
grep -H "VERSION = " sw.js app.js
echo "index.html: $(grep -c "?v=$next\"" index.html) Skripte mit ?v=$next"
