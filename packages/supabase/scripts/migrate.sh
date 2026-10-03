#!/usr/bin/env bash
# Applies packages/supabase/migrations/*.sql in order to the database in $SUPABASE_DB_URL,
# each file in its own transaction, recording applied files in public.schema_migrations
# so re-running only applies new files. Stops at the first error.
#
#   SUPABASE_DB_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
#     bash packages/supabase/scripts/migrate.sh [--dry-run]
set -euo pipefail

DIR="$(cd "$(dirname "$0")/../migrations" && pwd)"
URL="${SUPABASE_DB_URL:?Set SUPABASE_DB_URL to the Postgres connection string of the project}"
DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
PSQL=(psql "$URL" -v ON_ERROR_STOP=1 -X -q)

"${PSQL[@]}" -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
REVOKE ALL ON public.schema_migrations FROM PUBLIC;"

for f in "$DIR"/*.sql; do
  name="$(basename "$f")"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  applied="$("${PSQL[@]}" -tA -c "SELECT checksum FROM public.schema_migrations WHERE filename = '$name'")"
  if [[ -n "$applied" ]]; then
    [[ "$applied" != "$sum" ]] && echo "WARN  $name changed after it was applied (not re-run)" || echo "skip  $name"
    continue
  fi
  if (( DRY )); then echo "would apply $name"; continue; fi
  echo "apply $name"
  "${PSQL[@]}" --single-transaction -f "$f" \
    -c "INSERT INTO public.schema_migrations (filename, checksum) VALUES ('$name', '$sum')"
done
echo "done"
