#!/bin/sh
set -eu

PUID="${PUID:-99}"
PGID="${PGID:-100}"

if [ "$PUID" = "0" ] || [ "$PGID" = "0" ]; then
  echo "Refusing to run as root (PUID=0 or PGID=0)." >&2
  exit 1
fi

mkdir -p /config
chown -R "$PUID:$PGID" /config
chmod 700 /config
umask 077

exec setpriv --reuid="$PUID" --regid="$PGID" --clear-groups --no-new-privs \
  dotnet /app/PlexAutoRemover.dll
