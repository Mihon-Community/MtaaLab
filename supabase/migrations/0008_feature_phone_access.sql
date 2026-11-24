-- Pseudonymous feature-phone access, reusable across SMS and USSD.
-- Raw phone numbers are encrypted only after explicit nudge opt-in; the
-- HMAC digest is the lookup key. Codes are single-use and stored as digests.

alter table public.mobile_sessions
  alter column session_id drop not null;

create table if not exists public.mobile_join_codes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  code_digest text not null unique check (code_digest ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mobile_join_codes_class_expiry_idx
  on public.mobile_join_codes(class_id, expires_at);

alter table public.mobile_join_codes enable row level security;
revoke all on public.mobile_join_codes from public, anon, authenticated;

create table if not exists public.learner_channel_links (
  phone_ref text primary key check (phone_ref ~ '^[a-f0-9]{64}$'),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  encrypted_phone text,
  preferred_language text not null default 'en' check (preferred_language in ('en','sw')),
  consent_status text not null default 'linked'
    check (consent_status in ('linked','opted_in','stopped')),
  consent_at timestamptz,
  opted_out_at timestamptz,
  nudge_count integer not null default 0 check (nudge_count between 0 and 4),
  nudge_period text,
  nudge_last_session_id uuid references public.simulation_sessions(id) on delete set null,
  nudge_last_turn integer,
  created_at timestamptz not null default now(),
  check (
    (consent_status = 'opted_in' and encrypted_phone is not null and consent_at is not null)
    or consent_status <> 'opted_in'
  )
);
create index if not exists learner_channel_links_student_idx
  on public.learner_channel_links(student_id);
create index if not exists learner_channel_links_nudge_idx
  on public.learner_channel_links(consent_status, nudge_period)
  where consent_status = 'opted_in';

alter table public.learner_channel_links enable row level security;
revoke all on public.learner_channel_links from public, anon, authenticated;

comment on table public.mobile_join_codes is
  'Single-use, teacher-issued pseudonymous learner codes; only a peppered digest is stored.';
comment on table public.learner_channel_links is
  'HMAC phone lookup and explicit SMS nudge consent; phone ciphertext is stored only after opt-in.';
