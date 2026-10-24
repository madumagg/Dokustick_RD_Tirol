#!/bin/bash
# Ersteinrichtung: erzeugt server/.env mit allen Geheimnissen und die config.js fuer die App.
#
#   server/setup.sh            fragt Domain, Mail-Versand und Studio-Passwort ab
#
# Ohne Rueckfragen (z. B. fuer Tests) gehen die Werte auch als Umgebungsvariablen:
#   DOMAIN, PUBLIC_URL, SITE_ADDRESS, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SENDER,
#   ACME_EMAIL, STUDIO_PASSWORD, MAILER_AUTOCONFIRM, BACKUP_DIR
source "$(dirname "$0")/lib.sh"

if [ -f "$ENV_FILE" ] && [ "${1:-}" != "--neu" ]; then
  echo "$ENV_FILE gibt es schon. Neue Geheimnisse machen alle Anmeldungen ungültig."
  echo "Wirklich neu erzeugen: server/setup.sh --neu (nur VOR dem ersten Start sinnvoll)"
  exit 1
fi
command -v docker >/dev/null || { echo "Docker fehlt (siehe server/README.md)."; exit 1; }
command -v openssl >/dev/null || { echo "openssl fehlt: sudo apt install openssl"; exit 1; }

ask() { # ask VAR "Frage" [Vorgabe]
  local cur="${!1:-}"
  if [ -z "$cur" ]; then read -r -p "$2${3:+ [$3]}: " cur; cur="${cur:-${3:-}}"; fi
  printf -v "$1" '%s' "$cur"
}
ask DOMAIN "Adresse von DokuStick (ohne https://), z. B. dokustick.meinedomain.at"
ask SMTP_HOST "Mail-Server für den Versand (SMTP), z. B. smtp.meinanbieter.at"
ask SMTP_PORT "SMTP-Port" 587
ask SMTP_USER "SMTP-Benutzername (meist die E-Mail-Adresse)"
if [ -z "${SMTP_PASS:-}" ]; then read -r -s -p "SMTP-Passwort: " SMTP_PASS; echo; fi
ask SMTP_SENDER "Absender-Adresse" "$SMTP_USER"
ask ACME_EMAIL "E-Mail für das HTTPS-Zertifikat (Let's Encrypt)" "$SMTP_SENDER"
ask BACKUP_DIR "Ordner für Backups (NAS-Freigabe)" /mnt/nas/dokustick
PUBLIC_URL="${PUBLIC_URL:-https://$DOMAIN}"
SITE_ADDRESS="${SITE_ADDRESS:-$DOMAIN}"
STUDIO_PASSWORD="${STUDIO_PASSWORD:-$(openssl rand -base64 18 | tr -d '/+=')}"

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
JWT_SECRET="$(openssl rand -hex 32)"
jwt() { # Schluessel fuer anon bzw. service_role, 10 Jahre gueltig
  local now exp h p s
  now=$(date +%s); exp=$((now + 10 * 365 * 24 * 3600))
  h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  p=$(printf '{"role":"%s","iss":"supabase","iat":%d,"exp":%d}' "$1" "$now" "$exp" | b64url)
  s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
  printf '%s.%s.%s' "$h" "$p" "$s"
}
ANON_KEY="$(jwt anon)"
SERVICE_ROLE_KEY="$(jwt service_role)"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
STUDIO_PASSWORD_HASH="$(docker run --rm caddy:2.10.2-alpine caddy hash-password --plaintext "$STUDIO_PASSWORD")"

umask 077
cat > "$ENV_FILE" <<ENV
# DokuStick-Server – GEHEIM, nicht ins Repository (siehe .gitignore). Erzeugt am $(date '+%d.%m.%Y %H:%M').
DOMAIN=$DOMAIN
PUBLIC_URL=$PUBLIC_URL
SITE_ADDRESS=$SITE_ADDRESS
# Erlaubte Ziele fuer Links in Mails (Passwort vergessen usw.): neue Adresse und die alte auf GitHub Pages
REDIRECT_URLS=$PUBLIC_URL/**,https://madumagg.github.io/Dokustick_RD_Tirol/**

POSTGRES_PASSWORD=$POSTGRES_PASSWORD
JWT_SECRET=$JWT_SECRET
ANON_KEY=$ANON_KEY
SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY

SMTP_HOST=$SMTP_HOST
SMTP_PORT=$SMTP_PORT
SMTP_USER=$SMTP_USER
SMTP_PASS='$SMTP_PASS'
SMTP_SENDER=$SMTP_SENDER
MAILER_AUTOCONFIRM=${MAILER_AUTOCONFIRM:-false}
ACME_EMAIL=$ACME_EMAIL

STUDIO_USER=admin
STUDIO_PASSWORD_HASH='$STUDIO_PASSWORD_HASH'

BACKUP_DIR=$BACKUP_DIR
BACKUP_KEEP_DAYS=30
ENV

"$SERVER_DIR/config-js.sh" >/dev/null

echo
echo "Fertig: $ENV_FILE und server/generated/config.js angelegt."
echo "Studio (Verwaltung im Heimnetz, Port 8000): Benutzer admin, Passwort: $STUDIO_PASSWORD"
echo "Bitte das Studio-Passwort notieren. Weiter mit: server/start.sh"
