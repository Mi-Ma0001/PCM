-- ============================================================================
-- Plan de maintenance CMS — synchronisation optionnelle entre appareils
-- Une ligne par utilisateur (plan « principal ») contenant toutes ses données.
-- Sécurité : Row Level Security — chaque utilisateur ne voit et ne modifie
-- que ses propres plans. Le front-end n'utilise que la clé publique (anon).
-- ============================================================================

create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom         text not null default 'principal' check (char_length(nom) between 1 and 60),
  donnees     jsonb not null check (jsonb_typeof(donnees) = 'object'),
  version     integer not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint plans_un_nom_par_utilisateur unique (user_id, nom),
  constraint plans_taille_max check (pg_column_size(donnees) < 2000000)
);

comment on table public.plans is 'Données du plan de maintenance CMS, une ligne par utilisateur et par nom de plan.';
comment on column public.plans.version is 'Incrémentée à chaque mise à jour : sert à détecter les conflits entre appareils.';

-- Version et date de mise à jour gérées par la base (le client ne peut pas les forcer)
create or replace function public.plans_avant_mise_a_jour()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version    := old.version + 1;
  new.updated_at := now();
  new.user_id    := old.user_id;      -- un plan ne change jamais de propriétaire
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists plans_avant_mise_a_jour on public.plans;
create trigger plans_avant_mise_a_jour
  before update on public.plans
  for each row execute function public.plans_avant_mise_a_jour();

create or replace function public.plans_avant_creation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version    := 1;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plans_avant_creation on public.plans;
create trigger plans_avant_creation
  before insert on public.plans
  for each row execute function public.plans_avant_creation();

-- Row Level Security
alter table public.plans enable row level security;

drop policy if exists "plans : lecture de ses données" on public.plans;
create policy "plans : lecture de ses données" on public.plans
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "plans : création pour soi" on public.plans;
create policy "plans : création pour soi" on public.plans
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "plans : modification de ses données" on public.plans;
create policy "plans : modification de ses données" on public.plans
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "plans : suppression de ses données" on public.plans;
create policy "plans : suppression de ses données" on public.plans
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Droits : rien pour les visiteurs anonymes, CRUD (filtré par RLS) pour les connectés
revoke all on public.plans from anon;
grant select, insert, update, delete on public.plans to authenticated;

create index if not exists plans_user_id_idx on public.plans (user_id);
