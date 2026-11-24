# MtaaLab — The Living World Simulator

MtaaLab is a simulation-first learning platform. Learners explore a fictional community, make decisions, see deterministic consequences, and reflect on trade-offs. It includes four games: Mtoni Water Resilience, Soko Market, Mtoni Fever Response, and Chama Trust Circle. Teachers assign games to classes; the games are not restricted to a particular grade. The prototype does not claim proven learning impact.

Learners can play in the web app or on feature phones through SMS and USSD. Their saved game state follows them between channels. A teacher issues one-time phone-link codes from the teacher page.

## Run the project

Install Docker Desktop and make sure the root `.env` is configured. From the repository root, run:

```powershell
docker compose up --build
```

Open:

- Web app: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>

Compose starts the FastAPI backend, React frontend, and consent-guarded SMS nudge worker. The frontend calls the API through its Nginx proxy. Only the public Supabase URL and publishable key go into browser assets; backend credentials stay in the backend container. Press `Ctrl+C` to stop the foreground stack, or use `docker compose down` from another terminal.

Create the single root `.env` from `.env.example` if needed. Both apps use this root file; nested `backend/.env` and `frontend/.env` files are not used. Never commit `.env` or put secrets in `VITE_` variables.

## Mobile play

Configure the Africa's Talking callbacks and feature-phone onboarding in the [backend guide](docs/BACKEND_GUIDE.md). In brief: a teacher creates a learner link code at `/teacher`; the learner texts `JOIN <code>` to the sandbox short code or enters the code in USSD. SMS commands include `GAMES`, `PLAY 1`, `HELP`, and `CONTINUE`. USSD presents the same games and saved run through numbered prompts.

For sandbox testing, use Africa's Talking's web simulator; sandbox SMS does not reach a physical handset. For a handset test, use Live credentials, an approved sender ID or shortcode, a funded account, and Live callback configuration. If `AT_ALLOWED_PHONES` is set, include the simulator or test number there. A provider response of `sent` means the message was accepted for processing; confirm the final delivery status separately. See the [backend guide](docs/BACKEND_GUIDE.md) for steps.

## Architecture

- React, TypeScript, and Vite provide the responsive web experience.
- FastAPI owns authentication checks, game rules, simulation state, persistence, and Africa's Talking callbacks.
- Supabase provides PostgreSQL and Auth. Database migrations live in `supabase/migrations/`.
- Versioned deterministic rules compute game outcomes. NVIDIA NIM is limited to qualitative Mtoni feedback and cannot calculate game results; SMS and USSD use deterministic responses.
- Africa's Talking provides sandbox SMS and USSD access; Docker Compose also starts a worker for explicitly opted-in resume nudges.

## Guides

- [Backend and mobile setup](docs/BACKEND_GUIDE.md)
- [Game portfolio and gameplay](docs/GAME_PORTFOLIO.md)
- [Frontend guide](docs/FRONTEND_GUIDE.md)
- [API contract](docs/API_CONTRACT.md)
- [Current integration status and verification](docs/INTEGRATION_STATUS.md)
- [Contribution and branch workflow](CONTRIBUTING.md)
