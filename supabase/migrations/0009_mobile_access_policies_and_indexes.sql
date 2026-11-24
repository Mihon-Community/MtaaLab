-- Explicitly deny browser-role access to backend-owned learner/mobile data.
create policy simulation_reflections_no_client_access
  on public.simulation_reflections for all to anon, authenticated
  using (false) with check (false);

create policy mobile_join_codes_no_client_access
  on public.mobile_join_codes for all to anon, authenticated
  using (false) with check (false);

create policy learner_channel_links_no_client_access
  on public.learner_channel_links for all to anon, authenticated
  using (false) with check (false);

-- Cover foreign-key lookups and parent deletion/update checks.
create index if not exists mobile_join_codes_student_idx
  on public.mobile_join_codes(student_id);
create index if not exists mobile_join_codes_created_by_idx
  on public.mobile_join_codes(created_by);
create index if not exists learner_channel_links_class_idx
  on public.learner_channel_links(class_id);
create index if not exists learner_channel_links_nudge_session_idx
  on public.learner_channel_links(nudge_last_session_id);
