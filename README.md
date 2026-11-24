# MtaaLab — The Living World Simulator

MtaaLab is a simulation-first learning platform where K–12 students explore a fictional community challenge, make decisions, see rule-based consequences, and explain what changed. The first mission is **Mtoni water resilience**. The prototype is a technical and instructional concept; it does not claim proven learning impact.

## Architecture

- React + TypeScript + Vite PWA, Tailwind CSS, and Phaser 3 for the visual world.
- FastAPI + Pydantic backend owns authoritative decisions and deterministic simulation calculations.
- Supabase PostgreSQL, Auth, Storage, and Realtime provide durable records and platform services.
- NVIDIA NIM provides bounded, validated dialogue and learning feedback; it never computes numeric outcomes.
- Africa's Talking provides sandbox SMS and a constrained USSD participation channel.

The browser renders confirmed FastAPI state. The turn transaction stores the decision, events, snapshot, and session pointer atomically. Provider credentials remain backend-only. Supabase migrations are maintained under `supabase/migrations/`; configure the root `.env` with the project's connection details before using database-backed routes. The health endpoint only confirms that FastAPI is running.

## Quick start with Docker

Install Docker Desktop, make sure the root `.env` is present, then run this from the repository root:

```powershell
docker compose up --build
```

Compose builds and starts the FastAPI backend and the React frontend. Open:

- Frontend: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>

The frontend sends `/api` requests through its Nginx proxy to the backend container. Only the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` values are passed into the frontend build; backend secrets stay in the backend container. Press `Ctrl+C` to stop the foreground stack, or run `docker compose down` from another terminal.

To rebuild after changing frontend environment values, run `docker compose up --build` again. The backend reads the root `.env` when its container starts.

## Run without Docker

Backend (Python 3.12):

```powershell
Copy-Item .env.example .env
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

macOS/Linux: copy the root `.env.example` to `.env`, then run `python3.12 -m venv .venv && source .venv/bin/activate`; install the same requirements and run `uvicorn app.main:app --reload`.

Frontend (Node 22; see `.nvmrc`):

```sh
cd frontend
npm ci
npm run dev
```

Both apps read the single root `.env`, created from the single root `.env.example`.

The backend simulation, persistence, AI feedback, and Africa's Talking sandbox callback modules are implemented. Provider calls need the corresponding credentials in the root `.env`. Health check: `http://localhost:8000/api/health`.

## Teammate guides

- [Backend guide](docs/BACKEND_GUIDE.md)
- [Frontend guide](docs/FRONTEND_GUIDE.md)
- [Shared API contract](docs/API_CONTRACT.md)
- [Full project specification](docs/MtaaLab_Final_Project_Specification.pdf)
- [Contribution and branch workflow](CONTRIBUTING.md)
