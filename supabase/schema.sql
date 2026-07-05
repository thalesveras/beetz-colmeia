-- =========================================================
-- Beetz Colmeia — schema Supabase
-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Project > SQL Editor > New query > colar > Run)
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- departments ----------
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  icon text,
  description text,
  created_at timestamptz not null default now()
);

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  birth_date date,
  cpf text,
  phone text,
  email text,
  city text,
  state text,
  mother_name text,
  father_name text,
  emergency_contact_name text,
  emergency_contact_phone text,
  department_id uuid references public.departments (id) on delete set null,
  role text,
  experience_level text check (experience_level in ('Nova abelha', 'Em treinamento', 'Colaborador frequente', 'Líder de bar')),
  entry_date date,
  work_location text,
  skills text[] not null default '{}',
  health_conditions text,
  allergies text,
  important_notes text,
  about_me text,
  fun_fact text,
  favorite_events text,
  instagram text,
  personal_quote text,
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- events ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  location text,
  city text,
  status text not null default 'Planejado' check (status in ('Planejado', 'Confirmado', 'Em andamento', 'Concluído', 'Cancelado')),
  leader_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- event_members ----------
create table if not exists public.event_members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role_in_event text,
  created_at timestamptz not null default now(),
  unique (event_id, profile_id)
);

-- ---------- compliments (elogios) ----------
create table if not exists public.compliments (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles (id) on delete cascade,
  to_profile_id uuid not null references public.profiles (id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now()
);

-- ---------- honey_points (mel) ----------
create table if not exists public.honey_points (
  id uuid primary key default gen_random_uuid(),
  from_profile_id uuid not null references public.profiles (id) on delete cascade,
  to_profile_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null default 1 check (amount > 0),
  reason text,
  created_at timestamptz not null default now()
);

-- ---------- badges (medalhas) ----------
create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  badge_type text not null check (badge_type in ('first_event', 'ten_events', 'fifty_events', 'leader_highlight', 'punctuality', 'most_complimented')),
  awarded_at timestamptz not null default now(),
  unique (profile_id, badge_type)
);

-- =========================================================
-- Cria automaticamente uma linha em profiles quando alguém
-- se cadastra pelo Supabase Auth (email/senha)
-- =========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, onboarding_completed)
  values (new.id, new.email, false)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================
-- Row Level Security
-- Modelo: comunidade interna — todo mundo autenticado pode
-- ver todo mundo, mas só edita/insere o que é seu.
-- =========================================================
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.compliments enable row level security;
alter table public.honey_points enable row level security;
alter table public.badges enable row level security;

-- departments: leitura livre para autenticados
create policy "departments_select_authenticated" on public.departments
  for select to authenticated using (true);

-- profiles: leitura livre, mas só edita o próprio perfil
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- events: leitura livre; qualquer autenticado pode cadastrar/atualizar
-- (em produção, restrinja update a líderes/admins conforme sua regra de negócio)
create policy "events_select_authenticated" on public.events
  for select to authenticated using (true);
create policy "events_insert_authenticated" on public.events
  for insert to authenticated with check (true);
create policy "events_update_authenticated" on public.events
  for update to authenticated using (true) with check (true);

-- event_members: leitura livre; autenticados podem escalar equipe
create policy "event_members_select_authenticated" on public.event_members
  for select to authenticated using (true);
create policy "event_members_insert_authenticated" on public.event_members
  for insert to authenticated with check (true);

-- compliments: leitura livre; só posso elogiar em meu próprio nome
create policy "compliments_select_authenticated" on public.compliments
  for select to authenticated using (true);
create policy "compliments_insert_own" on public.compliments
  for insert to authenticated with check (auth.uid() = from_profile_id);

-- honey_points: leitura livre; só posso dar mel em meu próprio nome
create policy "honey_points_select_authenticated" on public.honey_points
  for select to authenticated using (true);
create policy "honey_points_insert_own" on public.honey_points
  for insert to authenticated with check (auth.uid() = from_profile_id);

-- badges: leitura livre; concessão feita via SQL Editor/backoffice (service role)
create policy "badges_select_authenticated" on public.badges
  for select to authenticated using (true);
