-- Keep the RLS recursion helper outside Supabase's exposed API schemas.
create schema mtaalab_internal;
revoke all on schema mtaalab_internal from public, anon, authenticated;
grant usage on schema mtaalab_internal to authenticated;
alter function public.is_mtaalab_class_member(uuid) set schema mtaalab_internal;
revoke all on function mtaalab_internal.is_mtaalab_class_member(uuid) from public, anon, authenticated;
grant execute on function mtaalab_internal.is_mtaalab_class_member(uuid) to authenticated;

-- Cover frequently checked foreign keys and parent-session lookup.
create index if not exists classes_teacher_idx on public.classes(teacher_id);
create index if not exists missions_published_version_idx on public.missions(published_version_id);
create index if not exists scenario_versions_approved_by_idx on public.scenario_versions(approved_by);
create index if not exists sessions_parent_idx on public.simulation_sessions(parent_session_id);

-- Evaluate auth.uid() once per statement instead of once per candidate row.
alter policy profiles_select_own on public.profiles
  using (id = (select auth.uid()));
alter policy schools_select_members on public.schools
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.school_id = schools.id
  ));
alter policy classes_select_members on public.classes
  using (
    teacher_id = (select auth.uid())
    or mtaalab_internal.is_mtaalab_class_member(id)
  );
alter policy class_memberships_select_own on public.class_memberships
  using (
    student_id = (select auth.uid())
    or exists (
      select 1 from public.classes c
      where c.id = class_id and c.teacher_id = (select auth.uid())
    )
  );
alter policy simulation_sessions_select_own on public.simulation_sessions
  using (student_id = (select auth.uid()));
alter policy simulation_decisions_select_own on public.simulation_decisions
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy simulation_events_select_own on public.simulation_events
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy snapshots_select_own on public.world_state_snapshots
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy ai_interactions_select_own on public.ai_interactions
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy assessments_select_own on public.learning_assessments
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy mobile_sessions_select_own on public.mobile_sessions
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
alter policy delivery_logs_select_own on public.delivery_logs
  using (exists (
    select 1 from public.simulation_sessions s
    where s.id = session_id and s.student_id = (select auth.uid())
  ));
