-- LDB Budget: database setup.
-- Paste all of this into Supabase -> SQL Editor -> New query, then press Run.
-- It is safe to run again later (it never deletes your numbers).
--
-- How privacy works: every table has Row Level Security on, and the only rule that opens a table is
-- "the signed-in person's email is on the members list". Anyone else, signed in or not, gets nothing.
--
-- BEFORE RUNNING: put the email you will sign in with on the last lines (owner).

-- ---------- who may see the budget ----------
create table if not exists public.members (
  email    text primary key check (email = lower(email) and email like '%@%'),
  role     text not null default 'member' check (role in ('owner', 'member')),
  added_at timestamptz not null default now()
);

create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = public.my_email())
$$;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where email = public.my_email() and role = 'owner')
$$;

-- ---------- the budget ----------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text not null check (length(name) between 1 and 60),
  kind       text not null default 'expense' check (kind in ('expense', 'income')),
  budget     numeric(12, 2) not null default 0 check (budget >= 0),
  color      text not null default '#7FD1A8',
  sort       int not null default 0,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id          bigint generated always as identity primary key,
  date        date not null default current_date,
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  amount      numeric(12, 2) not null check (amount > 0),
  category_id bigint references public.categories (id) on delete set null,
  note        text not null default '' check (length(note) <= 200),
  created_by  text not null default public.my_email(),
  created_at  timestamptz not null default now()
);
create index if not exists transactions_date_idx on public.transactions (date);

create table if not exists public.recurring (
  id          bigint generated always as identity primary key,
  name        text not null check (length(name) between 1 and 60),
  kind        text not null default 'expense' check (kind in ('expense', 'income')),
  amount      numeric(12, 2) not null check (amount > 0),
  category_id bigint references public.categories (id) on delete set null,
  cadence     text not null default 'monthly' check (cadence in ('weekly', 'monthly', 'yearly')),
  next_date   date not null default current_date,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.goals (
  id         bigint generated always as identity primary key,
  name       text not null check (length(name) between 1 and 60),
  target     numeric(12, 2) not null check (target > 0),
  saved      numeric(12, 2) not null default 0 check (saved >= 0),
  deadline   date,
  created_at timestamptz not null default now()
);

-- ---------- lock everything, then open it to members only ----------
alter table public.members      enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;
alter table public.recurring    enable row level security;
alter table public.goals        enable row level security;

drop policy if exists "members see members"    on public.members;
drop policy if exists "owner adds members"     on public.members;
drop policy if exists "owner changes members"  on public.members;
drop policy if exists "owner removes members"  on public.members;
create policy "members see members"   on public.members for select to authenticated using (public.is_member());
create policy "owner adds members"    on public.members for insert to authenticated with check (public.is_owner());
create policy "owner changes members" on public.members for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner removes members" on public.members for delete to authenticated using (public.is_owner() and email <> public.my_email());

drop policy if exists "members only" on public.categories;
drop policy if exists "members only" on public.transactions;
drop policy if exists "members only" on public.recurring;
drop policy if exists "members only" on public.goals;
create policy "members only" on public.categories   for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.transactions for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.recurring    for all to authenticated using (public.is_member()) with check (public.is_member());
create policy "members only" on public.goals        for all to authenticated using (public.is_member()) with check (public.is_member());

-- signed-out visitors get no access at all; signed-in people still pass through the rules above
revoke all on public.members, public.categories, public.transactions, public.recurring, public.goals from anon;
grant select, insert, update, delete on public.members, public.categories, public.transactions, public.recurring, public.goals to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on function public.my_email(), public.is_member(), public.is_owner() from public, anon;
grant execute on function public.my_email(), public.is_member(), public.is_owner() to authenticated;

-- live updates between devices (changes still pass through the rules above)
do $$
declare t text;
begin
  foreach t in array array['categories', 'transactions', 'recurring', 'goals', 'members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object or undefined_object then null;
    end;
  end loop;
end $$;

-- starter categories (only the first time; budgets start at 0 for you to fill in)
insert into public.categories (name, kind, color, sort)
select * from (values
  ('Housing', 'expense', '#7FD1A8', 1), ('Groceries', 'expense', '#6FB7E8', 2), ('Dining out', 'expense', '#F29CB0', 3),
  ('Transport', 'expense', '#B79CF0', 4), ('Utilities', 'expense', '#7ED9D2', 5), ('Subscriptions', 'expense', '#E58C8C', 6),
  ('Shopping', 'expense', '#C9A2E0', 7), ('Entertainment', 'expense', '#9BC48A', 8), ('Travel', 'expense', '#8FA8F0', 9),
  ('Other', 'expense', '#A3B8C8', 10), ('Paycheck', 'income', '#7FD1A8', 11), ('Other income', 'income', '#6FB7E8', 12)
) as v(name, kind, color, sort)
where not exists (select 1 from public.categories);

-- ---------- owner: the email you sign in with ----------
insert into public.members (email, role) values (lower('you@example.com'), 'owner')
on conflict (email) do update set role = 'owner';
