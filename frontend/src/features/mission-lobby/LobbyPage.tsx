import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "../../services/api";
import { getSupabaseClient } from "../../services/supabase";
import type {
  MissionListItem,
  MissionListResponse,
  SessionCreated,
} from "../../types/api";

function idempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `start-${Date.now()}-${Math.random()}`
  );
}

export function LobbyPage() {
  const navigate = useNavigate();
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [missions, setMissions] = useState<MissionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) setSession(nextSession);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!session) {
      setMissions([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    void apiFetch<MissionListResponse>("/api/missions")
      .then((result) => {
        if (alive) setMissions(result.missions);
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not load games. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [session]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (authError)
      setError("Sign-in failed. Check the school-issued account details.");
    else {
      setEmail("");
      setPassword("");
    }
  }

  async function openGame(mission: MissionListItem) {
    if (starting) return;
    setStarting(mission.id);
    setError("");
    try {
      let run: SessionCreated;
      if (mission.last_session_id && mission.last_session_status === "active") {
        run = {
          session_id: mission.last_session_id,
          mission_id: mission.id,
          scenario_id: "",
          turn: mission.current_turn,
          status: "active",
          state: {},
        };
      } else if (
        mission.last_session_id &&
        mission.last_session_status === "completed"
      ) {
        run = await apiFetch<SessionCreated>(
          `/api/simulations/${mission.last_session_id}/replay`,
          { method: "POST", body: JSON.stringify({}) },
          idempotencyKey(),
        );
      } else {
        run = await apiFetch<SessionCreated>(
          "/api/simulations",
          { method: "POST", body: JSON.stringify({ mission_id: mission.id }) },
          idempotencyKey(),
        );
      }
      navigate(
        `/simulation?missionId=${mission.id}&sessionId=${run.session_id}`,
      );
    } catch {
      setError(
        "Could not start this game. Your saved progress has not changed.",
      );
    } finally {
      setStarting(null);
    }
  }

  if (!supabase) {
    return (
      <section aria-labelledby="lobby-title">
        <h1 id="lobby-title">Choose a game</h1>
        <p>
          Connect the Supabase URL and publishable key to sign in and load your
          class games.
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section aria-labelledby="lobby-title">
        <h1 id="lobby-title">MtaaLab games</h1>
        <p>
          Sign in with the school-issued learner account. A full learner name is
          not needed here.
        </p>
        <form className="auth-form" onSubmit={(event) => void signIn(event)}>
          <label>
            Account
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit">Sign in</button>
        </form>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  }

  return (
    <section aria-labelledby="lobby-title">
      <div className="lobby-heading">
        <div>
          <p className="eyebrow">MtaaLab</p>
          <h1 id="lobby-title">Choose a game</h1>
          <p>
            Games assigned to your class. Your progress saves after each
            confirmed turn.
          </p>
        </div>
        <button type="button" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading your games…</p>}
      {!loading && missions.length === 0 && !error && (
        <p>
          No published games are assigned to this class yet. Ask your teacher to
          assign one.
        </p>
      )}
      <div className="game-grid">
        {missions.map((mission) => {
          const active = mission.last_session_status === "active";
          const completed = mission.last_session_status === "completed";
          return (
            <article className="game-card" key={mission.id}>
              <div className="game-card-heading">
                <h2>{mission.title}</h2>
                {mission.recommended && (
                  <span className="recommendation">Suggested</span>
                )}
              </div>
              <p>{mission.description}</p>
              <p className="game-meta">
                {mission.subject} · Assigned for your class
              </p>
              {active && (
                <p className="game-progress">
                  Saved progress · turn {mission.current_turn}
                </p>
              )}
              <button
                type="button"
                disabled={starting !== null}
                onClick={() => void openGame(mission)}
              >
                {starting === mission.id
                  ? "Opening…"
                  : active
                    ? "Continue"
                    : completed
                      ? "Replay"
                      : "Start game"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
