-- NOT APPLIED. Review and apply through the Supabase MCP server after project connection.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(), name text not null, country text not null,
  timezone text not null, created_at timestamptz not null default now()
);
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null, role text not null check (role in ('student','teacher','admin')),
  school_id uuid references public.schools(id), grade_level text, preferred_language text not null default 'en',
  accessibility_preferences jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  name text not null, grade_level text not null, teacher_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.class_memberships (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  membership_status text not null default 'active', created_at timestamptz not null default now(),
  unique(class_id, student_id)
);
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(), title text not null, description text not null,
  subject text not null, grade_band text not null, status text not null default 'draft',
  published_version_id uuid, created_at timestamptz not null default now()
);
create table if not exists public.scenario_versions (
  id uuid primary key default gen_random_uuid(), mission_id uuid not null references public.missions(id),
  version integer not null, initial_state jsonb not null, rules_version text not null,
  learning_objectives jsonb not null default '[]'::jsonb, approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), unique(mission_id, version)
);
alter table public.missions add constraint missions_published_version_fk
  foreign key (published_version_id) references public.scenario_versions(id);
create table if not exists public.simulation_sessions (
  id uuid primary key default gen_random_uuid(), student_id uuid not null references public.profiles(id),
  mission_version_id uuid not null references public.scenario_versions(id), status text not null default 'active',
  current_turn integer not null default 0 check (current_turn >= 0), current_state jsonb not null,
  started_at timestamptz not null default now(), completed_at timestamptz, parent_session_id uuid references public.simulation_sessions(id)
);
create table if not exists public.simulation_decisions (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  turn_number integer not null, action_type text not null, validated_parameters jsonb not null default '{}'::jsonb,
  idempotency_key text not null, expected_turn integer not null, created_at timestamptz not null default now(),
  unique(session_id, idempotency_key), unique(session_id, turn_number)
);
create table if not exists public.simulation_events (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  turn_number integer not null, event_type text not null, payload jsonb not null default '{}'::jsonb,
  engine_version text not null, created_at timestamptz not null default now()
);
create table if not exists public.world_state_snapshots (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  turn_number integer not null, state jsonb not null, state_hash text not null, created_at timestamptz not null default now(),
  unique(session_id, turn_number)
);
create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  task_type text not null, model_id text not null, output jsonb not null, validation_status text not null,
  latency_ms integer, created_at timestamptz not null default now()
);
create table if not exists public.learning_assessments (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  rubric_version text not null, evidence jsonb not null, feedback jsonb not null,
  teacher_review_status text not null default 'pending', created_at timestamptz not null default now()
);
create table if not exists public.mobile_sessions (
  id uuid primary key default gen_random_uuid(), provider_session_id text not null unique,
  phone_ref text not null, session_id uuid not null references public.simulation_sessions(id) on delete cascade,
  current_menu text not null, state jsonb not null default '{}'::jsonb, expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table if not exists public.delivery_logs (
  id uuid primary key default gen_random_uuid(), session_id uuid references public.simulation_sessions(id) on delete set null,
  channel text not null, recipient_ref text not null, provider_message_id text, status text not null,
  error_code text, created_at timestamptz not null default now()
);

create index if not exists profiles_school_idx on public.profiles(school_id);
create index if not exists classes_school_teacher_idx on public.classes(school_id, teacher_id);
create index if not exists memberships_student_class_idx on public.class_memberships(student_id, class_id);
create index if not exists sessions_student_status_idx on public.simulation_sessions(student_id, status);
create index if not exists sessions_mission_idx on public.simulation_sessions(mission_version_id);
create index if not exists decisions_session_turn_idx on public.simulation_decisions(session_id, turn_number);
create index if not exists events_session_turn_idx on public.simulation_events(session_id, turn_number);
create index if not exists snapshots_session_turn_idx on public.world_state_snapshots(session_id, turn_number);
create index if not exists ai_interactions_session_idx on public.ai_interactions(session_id, created_at);
create index if not exists assessments_session_idx on public.learning_assessments(session_id);
create index if not exists mobile_sessions_session_expiry_idx on public.mobile_sessions(session_id, expires_at);
create index if not exists delivery_logs_session_idx on public.delivery_logs(session_id, created_at);

alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_memberships enable row level security;
alter table public.missions enable row level security;
alter table public.scenario_versions enable row level security;
alter table public.simulation_sessions enable row level security;
alter table public.simulation_decisions enable row level security;
alter table public.simulation_events enable row level security;
alter table public.world_state_snapshots enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.learning_assessments enable row level security;
alter table public.mobile_sessions enable row level security;
alter table public.delivery_logs enable row level security;

-- SECURITY DEFINER avoids recursive RLS evaluation when class policies check membership.
create or replace function public.is_mtaalab_class_member(target_class uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.class_memberships cm where cm.class_id=target_class and cm.student_id=auth.uid()) $$;

-- Explicit operation policies: clients can read only their scoped records; writes are backend-only.
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_insert_backend_only on public.profiles for insert to authenticated with check (false);
create policy profiles_update_backend_only on public.profiles for update to authenticated using (false) with check (false);
create policy profiles_delete_backend_only on public.profiles for delete to authenticated using (false);
create policy schools_select_members on public.schools for select to authenticated using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.school_id=schools.id));
create policy schools_insert_backend_only on public.schools for insert to authenticated with check (false);
create policy schools_update_backend_only on public.schools for update to authenticated using (false) with check (false);
create policy schools_delete_backend_only on public.schools for delete to authenticated using (false);
create policy classes_select_members on public.classes for select to authenticated using (teacher_id=auth.uid() or public.is_mtaalab_class_member(id));
create policy classes_insert_backend_only on public.classes for insert to authenticated with check (false);
create policy classes_update_backend_only on public.classes for update to authenticated using (false) with check (false);
create policy classes_delete_backend_only on public.classes for delete to authenticated using (false);
create policy class_memberships_select_own on public.class_memberships for select to authenticated using (student_id=auth.uid() or exists(select 1 from public.classes c where c.id=class_id and c.teacher_id=auth.uid()));
create policy class_memberships_insert_backend_only on public.class_memberships for insert to authenticated with check (false);
create policy class_memberships_update_backend_only on public.class_memberships for update to authenticated using (false) with check (false);
create policy class_memberships_delete_backend_only on public.class_memberships for delete to authenticated using (false);
create policy missions_select_published on public.missions for select to authenticated using (status='published');
create policy missions_insert_backend_only on public.missions for insert to authenticated with check (false);
create policy missions_update_backend_only on public.missions for update to authenticated using (false) with check (false);
create policy missions_delete_backend_only on public.missions for delete to authenticated using (false);
create policy scenario_versions_select_published on public.scenario_versions for select to authenticated using (exists(select 1 from public.missions m where m.id=mission_id and m.status='published'));
create policy scenario_versions_insert_backend_only on public.scenario_versions for insert to authenticated with check (false);
create policy scenario_versions_update_backend_only on public.scenario_versions for update to authenticated using (false) with check (false);
create policy scenario_versions_delete_backend_only on public.scenario_versions for delete to authenticated using (false);
create policy simulation_sessions_select_own on public.simulation_sessions for select to authenticated using (student_id=auth.uid());
create policy simulation_sessions_insert_backend_only on public.simulation_sessions for insert to authenticated with check (false);
create policy simulation_sessions_update_backend_only on public.simulation_sessions for update to authenticated using (false) with check (false);
create policy simulation_sessions_delete_backend_only on public.simulation_sessions for delete to authenticated using (false);

-- Child records inherit visibility through their owning session.
create policy simulation_decisions_select_own on public.simulation_decisions for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy simulation_decisions_insert_backend_only on public.simulation_decisions for insert to authenticated with check (false);
create policy simulation_decisions_update_backend_only on public.simulation_decisions for update to authenticated using (false) with check (false);
create policy simulation_decisions_delete_backend_only on public.simulation_decisions for delete to authenticated using (false);
create policy simulation_events_select_own on public.simulation_events for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy simulation_events_insert_backend_only on public.simulation_events for insert to authenticated with check (false);
create policy simulation_events_update_backend_only on public.simulation_events for update to authenticated using (false) with check (false);
create policy simulation_events_delete_backend_only on public.simulation_events for delete to authenticated using (false);
create policy snapshots_select_own on public.world_state_snapshots for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy snapshots_insert_backend_only on public.world_state_snapshots for insert to authenticated with check (false);
create policy snapshots_update_backend_only on public.world_state_snapshots for update to authenticated using (false) with check (false);
create policy snapshots_delete_backend_only on public.world_state_snapshots for delete to authenticated using (false);
create policy ai_interactions_select_own on public.ai_interactions for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy ai_interactions_insert_backend_only on public.ai_interactions for insert to authenticated with check (false);
create policy ai_interactions_update_backend_only on public.ai_interactions for update to authenticated using (false) with check (false);
create policy ai_interactions_delete_backend_only on public.ai_interactions for delete to authenticated using (false);
create policy assessments_select_own on public.learning_assessments for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy assessments_insert_backend_only on public.learning_assessments for insert to authenticated with check (false);
create policy assessments_update_backend_only on public.learning_assessments for update to authenticated using (false) with check (false);
create policy assessments_delete_backend_only on public.learning_assessments for delete to authenticated using (false);
create policy mobile_sessions_select_own on public.mobile_sessions for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy mobile_sessions_insert_backend_only on public.mobile_sessions for insert to authenticated with check (false);
create policy mobile_sessions_update_backend_only on public.mobile_sessions for update to authenticated using (false) with check (false);
create policy mobile_sessions_delete_backend_only on public.mobile_sessions for delete to authenticated using (false);
create policy delivery_logs_select_own on public.delivery_logs for select to authenticated using (exists(select 1 from public.simulation_sessions s where s.id=session_id and s.student_id=auth.uid()));
create policy delivery_logs_insert_backend_only on public.delivery_logs for insert to authenticated with check (false);
create policy delivery_logs_update_backend_only on public.delivery_logs for update to authenticated using (false) with check (false);
create policy delivery_logs_delete_backend_only on public.delivery_logs for delete to authenticated using (false);
