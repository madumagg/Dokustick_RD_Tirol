#!/bin/bash
# Erhoeht die App-Version an allen Stellen (Offline-Speicher, Datei-Adressen, Anzeige).
# Aufruf: tools/version.sh 16
set -euo pipefail
[ $# -eq 1 ] || { echo "Aufruf: $0 <neue Versionsnummer>"; exit 1; }
cd "$(dirname "$0")/../webapp"
sed -i -E "s/^const VERSION = '[0-9]+';/const VERSION = '$1';/" sw.js
sed -i -E "s/^const APP_VERSION = '[0-9]+';/const APP_VERSION = '$1';/" app.js
sed -i -E "s/\.js\?v=[0-9]+\"/.js?v=$1\"/g" index.html
grep -H "VERSION = " sw.js app.js
grep -c "?v=$1\"" index.html | xargs echo "index.html: Skripte mit ?v=$1:"
