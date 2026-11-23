-- Add class-scoped mission assignments and callback idempotency without changing
-- existing simulation records.

create table if not exists public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique (class_id, mission_id)
);

create index if not exists mission_assignments_mission_id_idx
  on public.mission_assignments(mission_id);
create index if not exists mission_assignments_assigned_by_idx
  on public.mission_assignments(assigned_by);

alter table public.mission_assignments enable row level security;
grant select, insert, update, delete on public.mission_assignments to authenticated;

create policy mission_assignments_select_class_members
  on public.mission_assignments for select to authenticated
  using (
    exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
    or exists (
      select 1
      from public.class_memberships cm
      where cm.class_id = mission_assignments.class_id
        and cm.student_id = (select auth.uid())
        and cm.membership_status = 'active'
    )
  );

create policy mission_assignments_insert_own_class
  on public.mission_assignments for insert to authenticated
  with check (
    assigned_by = (select auth.uid())
    and exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
  );

create policy mission_assignments_update_own_class
  on public.mission_assignments for update to authenticated
  using (
    exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
  )
  with check (
    assigned_by = (select auth.uid())
    and exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
  );

create policy mission_assignments_delete_own_class
  on public.mission_assignments for delete to authenticated
  using (
    exists (
      select 1
      from public.classes c
      join public.profiles p on p.id = c.teacher_id
      where c.id = mission_assignments.class_id
        and c.teacher_id = (select auth.uid())
        and p.role = 'teacher'
        and p.school_id = c.school_id
    )
  );

-- Store only a one-way reference to the configured sandbox phone. Raw phone
-- numbers are never persisted in this table.
create table if not exists public.sandbox_phone_mappings (
  phone_ref text primary key check (phone_ref ~ '^[a-f0-9]{64}$'),
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists sandbox_phone_mappings_student_id_idx
  on public.sandbox_phone_mappings(student_id);

alter table public.sandbox_phone_mappings enable row level security;
revoke all on public.sandbox_phone_mappings from public, anon, authenticated;
create policy sandbox_phone_mappings_no_client_access
  on public.sandbox_phone_mappings for all to anon, authenticated
  using (false) with check (false);

-- learning_assessments has no session/rubric uniqueness guard in 0001.
create unique index if not exists learning_assessments_session_rubric_version_uidx
  on public.learning_assessments(session_id, rubric_version);

alter table public.mobile_sessions
  add column if not exists last_request_key text;

-- 0001 already defines this unique key. Add it only if a database was created
-- from a compatible schema that omitted it.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    where i.indrelid = 'public.mobile_sessions'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indpred is null
      and i.indnkeyatts = 1
      and array(
        select a.attname::text
        from unnest(i.indkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = key_column.attnum
        where key_column.ordinality <= i.indnkeyatts
        order by key_column.ordinality
      ) = array['provider_session_id']::text[]
  ) then
    create unique index mobile_sessions_provider_session_id_uidx
      on public.mobile_sessions(provider_session_id);
  end if;
end;
$$;

-- The partial unique index permits multiple null IDs while making provider
-- delivery callbacks idempotent for every message ID they do include.
create unique index if not exists delivery_logs_provider_message_id_uidx
  on public.delivery_logs(provider_message_id)
  where provider_message_id is not null;

-- Assign Mtoni to the seeded demonstration class using natural keys rather
-- than embedding generated database IDs in this migration.
insert into public.mission_assignments(class_id, mission_id, assigned_by)
select c.id, m.id, c.teacher_id
from public.classes c
join public.schools s on s.id = c.school_id
join public.missions m on m.title = 'Mtoni water resilience'
where c.name = 'Mtoni Demo Class'
  and s.name = 'Mtoni Demo School'
on conflict (class_id, mission_id) do nothing;
