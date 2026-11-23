# Supabase setup (deferred)

The project is not connected yet. No migration in this repository has been applied. When the team connects the Supabase MCP server:

1. Use the MCP project-listing tool to identify and confirm the intended project and its ref. Do not print secret keys.
2. Review `migrations/0001_initial_schema.sql` with both developers. Apply it through the MCP migration/query surface and record the result in the PR.
3. Run `seed.sql` only against a disposable/demo project. The fixtures use synthetic identities and no passwords. Create usable demo sign-in credentials through Auth separately.
4. Generate TypeScript types from the connected project schema and save them as `frontend/src/types/database.ts` (generated output is gitignored until reviewed and intentionally added).
5. Create buckets: `mission-assets` (public only for approved non-sensitive assets; otherwise private), `session-reports` (private), `student-submissions` (private), and `generated-audio` (private). Add narrowly scoped policies and short-lived signed URLs as needed.
6. Before any client access, verify RLS for every exposed table, ownership/class assignment rules, and denied client writes. Simulation writes stay behind FastAPI.

The backend's primary persistence path is SQLAlchemy/psycopg using `SUPABASE_DB_URL`; optional Supabase secret key use is backend-only and requires explicit FastAPI authorization because it bypasses RLS.
