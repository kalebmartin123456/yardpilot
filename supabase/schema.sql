create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  business_slug text,
  stripe_customer_id text,
  stripe_subscription_id text,
  square_customer_id text,
  square_subscription_id text,
  subscription_status text not null default 'trial',
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists business_slug text;

alter table public.profiles
  add column if not exists square_customer_id text;

alter table public.profiles
  add column if not exists square_subscription_id text;

update public.profiles
set business_slug = 'operator-' || left(id::text, 6)
where business_slug is null or business_slug = '';

create unique index if not exists profiles_business_slug_key
  on public.profiles (business_slug)
  where business_slug is not null;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null,
  service text not null,
  property_details text not null,
  timeline text not null default 'Flexible',
  budget text,
  notes text,
  quoted_price integer,
  status text not null default 'New'
    check (status in ('New', 'Quoted', 'Followed up', 'Won', 'Lost')),
  created_at timestamptz not null default now()
);

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google',
  selected_calendar_id text,
  encrypted_refresh_token text,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  google_calendar_event_id text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service_name text not null,
  base_price integer not null,
  condition_fee integer not null default 0,
  large_property_fee integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.public_quote_leads (
  id uuid primary key default gen_random_uuid(),
  business_slug text not null,
  customer_name text not null,
  service text not null,
  property_details text not null,
  timeline text not null default 'Flexible',
  budget text,
  notes text,
  quoted_price integer,
  status text not null default 'New'
    check (status in ('New', 'Quoted', 'Followed up', 'Won', 'Lost')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.leads enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.bookings enable row level security;
alter table public.pricing_rules enable row level security;
alter table public.public_quote_leads enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can manage own leads" on public.leads;
drop policy if exists "Users can manage own calendar connections" on public.calendar_connections;
drop policy if exists "Users can manage own bookings" on public.bookings;
drop policy if exists "Users can manage own pricing rules" on public.pricing_rules;
drop policy if exists "Anyone can submit public quote leads" on public.public_quote_leads;
drop policy if exists "Anyone can read public quote leads for demo" on public.public_quote_leads;
drop policy if exists "Anyone can update public quote lead status for demo" on public.public_quote_leads;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can create own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can manage own leads"
  on public.leads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own calendar connections"
  on public.calendar_connections for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own bookings"
  on public.bookings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own pricing rules"
  on public.pricing_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Anyone can submit public quote leads"
  on public.public_quote_leads for insert
  with check (business_slug <> '' and customer_name <> '' and property_details <> '');

create policy "Anyone can read public quote leads for demo"
  on public.public_quote_leads for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.business_slug = public_quote_leads.business_slug
    )
  );

create policy "Anyone can update public quote lead status for demo"
  on public.public_quote_leads for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.business_slug = public_quote_leads.business_slug
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.business_slug = public_quote_leads.business_slug
    )
  );

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, business_name, business_slug)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'business_name', split_part(new.email, '@', 1) || ' Lawn Co.'),
    coalesce(
      nullif(regexp_replace(lower(new.raw_user_meta_data ->> 'business_slug'), '[^a-z0-9]+', '-', 'g'), ''),
      regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g') || '-' || left(new.id::text, 6)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
