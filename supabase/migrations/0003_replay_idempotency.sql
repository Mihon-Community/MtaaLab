-- A replay request is idempotent within its source session.
alter table public.simulation_sessions
  add column creation_idempotency_key text
  check (
    creation_idempotency_key is null
    or (length(creation_idempotency_key) between 1 and 128)
  );

create unique index simulation_sessions_replay_idempotency_idx
  on public.simulation_sessions(parent_session_id, creation_idempotency_key)
  where parent_session_id is not null and creation_idempotency_key is not null;
