-- Deduplicate original session creation per learner and immutable mission version.
create unique index simulation_sessions_creation_idempotency_idx
  on public.simulation_sessions(
    student_id,
    mission_version_id,
    creation_idempotency_key
  )
  where parent_session_id is null and creation_idempotency_key is not null;
