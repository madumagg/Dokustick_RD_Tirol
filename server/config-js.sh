#!/bin/bash
# Schreibt server/generated/config.js (Adresse und öffentlicher Schlüssel dieses Servers) aus .env.
# setup.sh ruft das selbst auf; nötig nach dem Wiederherstellen einer .env aus einem Backup.
source "$(dirname "$0")/lib.sh"
need_env
umask 022
mkdir -p "$SERVER_DIR/generated"
cat > "$SERVER_DIR/generated/config.js" <<JS
// Erzeugt von server/config-js.sh – Zugangsdaten dieses Servers (der anon-Schluessel ist oeffentlich)
window.DOKUSTICK_CONFIG = {
  supabaseUrl: '$PUBLIC_URL',
  supabaseAnonKey: '$ANON_KEY',
};
JS
echo "server/generated/config.js geschrieben ($PUBLIC_URL)."
