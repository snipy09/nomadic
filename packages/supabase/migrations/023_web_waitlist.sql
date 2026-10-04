-- Launch email list for the marketing site (apps/web). Safe to re-run.

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  email text not null,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  constraint waitlist_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  constraint waitlist_source_len check (length(source) <= 40)
);

create unique index if not exists waitlist_email_key on public.waitlist (lower(email));
create index if not exists waitlist_created_at_idx on public.waitlist (created_at);

-- RLS on with no policies: the list cannot be read or written directly with the public key.
alter table public.waitlist enable row level security;
revoke all on public.waitlist from anon, authenticated;

-- The site writes only through this function. Duplicates are accepted silently,
-- so the response never reveals whether an address is already on the list.
create or replace function public.join_waitlist(p_email text, p_source text default 'web')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
begin
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email' using errcode = '22023';
  end if;

  -- Crude flood guard: stop accepting once the last minute has seen 30 new rows.
  if (select count(*) from public.waitlist where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'too many requests' using errcode = '54000';
  end if;

  insert into public.waitlist (email, source)
  values (v_email, left(coalesce(nullif(trim(p_source), ''), 'web'), 40))
  on conflict ((lower(email))) do nothing;

  return true;
end;
$$;

revoke all on function public.join_waitlist(text, text) from public;
grant execute on function public.join_waitlist(text, text) to anon, authenticated;
