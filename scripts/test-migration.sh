#!/usr/bin/env bash
# Teste la migration Supabase sur un PostgreSQL local jetable :
# création de la table, triggers de version, et isolation RLS entre deux utilisateurs.
set -euo pipefail
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
[ -x "$BIN/pg_ctl" ] || { echo "PostgreSQL introuvable (pg_ctl)."; exit 1; }
DIR=$(mktemp -d); PORT=55439
cleanup() { "$BIN/pg_ctl" -D "$DIR/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown -R postgres "$DIR" 2>/dev/null || { RUN=""; }; else RUN=""; fi
$RUN "$BIN/initdb" -D "$DIR/data" -U postgres --auth=trust >/dev/null
$RUN "$BIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL="env PGOPTIONS=-cclient_min_messages=warning psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

# Environnement minimal imitant Supabase : schéma auth, rôles anon/authenticated, auth.uid()
$PSQL <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon; create role authenticated;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','a@test.tn'), ('22222222-2222-2222-2222-222222222222','b@test.tn');
SQL
$PSQL -f "$(dirname "$0")/../supabase/migrations/20261110000000_plans.sql"
# Rejouer la migration doit être sans effet (idempotence)
$PSQL -f "$(dirname "$0")/../supabase/migrations/20261110000000_plans.sql"

$PSQL <<'SQL'
\set QUIET on
-- Utilisateur A : création puis mise à jour
set role authenticated; set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
insert into public.plans (nom, donnees) values ('principal', '{"equipements": []}');
update public.plans set donnees = '{"equipements": [{"id":"EQ01"}]}', version = 99;
do $$ begin
  if (select version from public.plans) <> 2 then raise exception 'ÉCHEC : la version doit valoir 2 (et non être forcée par le client)'; end if;
end $$;
-- Utilisateur B : ne voit rien, ne peut rien modifier ni usurper A
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$ begin
  if (select count(*) from public.plans) <> 0 then raise exception 'ÉCHEC RLS : B voit le plan de A'; end if;
end $$;
update public.plans set donnees = '{}' ;
do $$ declare ok boolean := false; begin
  begin insert into public.plans (user_id, nom, donnees) values ('11111111-1111-1111-1111-111111111111', 'pirate', '{}'); exception when insufficient_privilege or check_violation then ok := true; end;
  if not ok then raise exception 'ÉCHEC RLS : B a créé un plan au nom de A'; end if;
end $$;
-- Visiteur anonyme : aucun accès
reset request.jwt.claim.sub; set role anon;
do $$ declare ok boolean := false; begin
  begin perform * from public.plans; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'ÉCHEC : le rôle anon peut lire la table'; end if;
end $$;
-- Les données de A sont intactes
reset role; 
do $$ begin
  if (select donnees->'equipements'->0->>'id' from public.plans where nom='principal') <> 'EQ01' then raise exception 'ÉCHEC : données de A modifiées par B'; end if;
  if (select count(*) from public.plans) <> 1 then raise exception 'ÉCHEC : nombre de plans inattendu'; end if;
end $$;
SQL
echo "✓ Migration SQL : création, idempotence, version gérée par la base, isolation RLS (A / B / anonyme) — OK"
