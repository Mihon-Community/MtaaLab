# MtaaLab — The Living World Simulator

MtaaLab is a simulation-first learning platform where K–12 students explore a fictional community challenge, make decisions, see rule-based consequences, and explain what changed. The first mission is **Mtoni water resilience**. The prototype is a technical and instructional concept; it does not claim proven learning impact.

## Architecture

- React + TypeScript + Vite PWA, Tailwind CSS, and Phaser 3 for the visual world.
- FastAPI + Pydantic backend owns authoritative decisions and deterministic simulation calculations.
- Supabase PostgreSQL, Auth, Storage, and Realtime provide durable records and platform services.
- NVIDIA NIM provides bounded, validated dialogue and learning feedback; it never computes numeric outcomes.
- Africa's Talking provides sandbox SMS and a constrained USSD participation channel.

The browser renders confirmed FastAPI state. The turn transaction stores the decision, events, snapshot, and session pointer atomically. Provider credentials remain backend-only. Supabase has not been connected and the checked-in migration has not been applied.

## Quick start

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

Both apps read the one root `.env`. The per-app `.env.example` files are reference templates; do not create separate per-app `.env` files.

The apps start without provider credentials. Health check: `http://localhost:8000/api/health`. Product modules are stubs with TODOs and do not yet implement the mission.

## Teammate guides

- [Backend guide](docs/BACKEND_GUIDE.md)
- [Frontend guide](docs/FRONTEND_GUIDE.md)
- [Shared API contract](docs/API_CONTRACT.md)
- [Full project specification](docs/MtaaLab_Final_Project_Specification.pdf)
- [Contribution and branch workflow](CONTRIBUTING.md)
