-- Versioned game portfolio. Existing Mtoni identifiers remain unchanged.
alter table public.missions
  add column if not exists slug text;

update public.missions
set slug = 'mtoni-water-resilience'
where title = 'Mtoni water resilience' and slug is null;

update public.missions
set grade_band = 'Teacher assigned'
where slug = 'mtoni-water-resilience';

create unique index if not exists missions_slug_uidx
  on public.missions(slug)
  where slug is not null;

alter table public.simulation_sessions
  add column if not exists event_seed integer not null default 0;

create table if not exists public.simulation_reflections (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  turn_number integer not null check (turn_number > 0),
  answer_code text not null check (answer_code in ('1','2','3')),
  misconception_tag text not null check (length(misconception_tag) between 1 and 80),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (session_id, turn_number)
);
alter table public.simulation_reflections enable row level security;
revoke all on public.simulation_reflections from public, anon, authenticated;

insert into public.missions(id, slug, title, description, subject, grade_band, status)
values
  (gen_random_uuid(), 'mama-mboga-market', 'Mama Mboga Market',
   'Run a fictional market stall. Balance order size, selling price and cash across six market days.',
   'Mathematics, Social Studies', 'Teacher assigned', 'published'),
  (gen_random_uuid(), 'mtoni-fever-response', 'Mtoni Fever Response',
   'Plan fictional community prevention and clinic readiness improvements with delayed effects.',
   'Integrated Science, Mathematics, Social Studies', 'Teacher assigned', 'published'),
  (gen_random_uuid(), 'chama-trust-circle', 'Chama Trust Circle',
   'A fictional group weighs savings, a reserve and requests using transparent token accounts.',
   'Mathematics, Social Studies', 'Teacher assigned', 'published')
on conflict (slug) where slug is not null do nothing;

insert into public.scenario_versions(id, mission_id, version, initial_state, rules_version, learning_objectives, approved_by)
select gen_random_uuid(), m.id, 1,
       '{"current_turn":0,"cash_credits":100,"stock_units":10,"selling_price":8,"total_sold":0,"total_spoiled":0,"completed_actions":[]}'::jsonb,
       'soko-market-v1',
       '["Distinguish sales revenue from cash remaining after an order.","Explain how price, demand, stock and spoilage interact.","Compare plans using values from the market-day record."]'::jsonb,
       null
from public.missions m
where m.slug = 'mama-mboga-market'
on conflict (mission_id, version) do nothing;

insert into public.scenario_versions(id, mission_id, version, initial_state, rules_version, learning_objectives, approved_by)
select gen_random_uuid(), m.id, 1,
       '{"current_turn":0,"budget_tokens":100,"safe_water_points":60,"handwashing_points":20,"clinic_readiness":20,"pending_effects":[],"completed_actions":[]}'::jsonb,
       'mtoni-fever-v1',
       '["Explain why infrastructure improvements may have delayed effects.","Compare safe-water, handwashing and clinic-readiness trade-offs.","Use the event log to distinguish a game index from health data."]'::jsonb,
       null
from public.missions m
where m.slug = 'mtoni-fever-response'
on conflict (mission_id, version) do nothing;

insert into public.scenario_versions(id, mission_id, version, initial_state, rules_version, learning_objectives, approved_by)
select gen_random_uuid(), m.id, 1,
       '{"current_turn":0,"pool_tokens":100,"reserve_tokens":20,"outstanding_tokens":0,"repayments_received":0,"delayed_tokens":0,"scheduled_repayments":[],"completed_actions":[]}'::jsonb,
       'chama-circle-v1',
       '["Distinguish the group pool from the amount available to lend.","Calculate a simple fictional percentage fee and total due.","Explain how a reserve changes the group\u0027s choices under uncertainty."]'::jsonb,
       null
from public.missions m
where m.slug = 'chama-trust-circle'
on conflict (mission_id, version) do nothing;

update public.missions m
set published_version_id = v.id
from public.scenario_versions v
where v.mission_id = m.id
  and v.version = 1
  and (
    (m.slug = 'mama-mboga-market' and v.rules_version = 'soko-market-v1')
    or (m.slug = 'mtoni-fever-response' and v.rules_version = 'mtoni-fever-v1')
    or (m.slug = 'chama-trust-circle' and v.rules_version = 'chama-circle-v1')
  );

insert into public.mission_assignments(class_id, mission_id, assigned_by)
select c.id, m.id, c.teacher_id
from public.classes c
join public.missions m on m.slug in (
  'mama-mboga-market', 'mtoni-fever-response', 'chama-trust-circle'
)
where c.name = 'Mtoni Demo Class'
on conflict (class_id, mission_id) do nothing;
