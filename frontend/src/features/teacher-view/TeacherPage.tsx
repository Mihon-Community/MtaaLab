import { useEffect, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiFetch } from "../../services/api";
import { getSupabaseClient } from "../../services/supabase";
import type {
  MobileJoinCodeResponse,
  MobileRosterClass,
  MobileRosterResponse,
} from "../../types/api";

export function TeacherPage() {
  const supabase = getSupabaseClient();
  const [session, setSession] = useState<Session | null>(null);
  const [classes, setClasses] = useState<MobileRosterClass[]>([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [joinCode, setJoinCode] = useState<MobileJoinCodeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

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
      setClasses([]);
      return;
    }
    let alive = true;
    setLoading(true);
    setError("");
    void apiFetch<MobileRosterResponse>("/api/mobile/classes")
      .then((result) => {
        if (alive) setClasses(result.classes);
      })
      .catch(() => {
        if (alive)
          setError(
            "Could not load your class roster. Check your teacher account and try again.",
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
      setError("Sign-in failed. Check the school-issued teacher account.");
    else {
      setEmail("");
      setPassword("");
    }
  }

  async function issueCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!classId || !studentId || creating) return;
    setCreating(true);
    setError("");
    setJoinCode(null);
    try {
      const result = await apiFetch<MobileJoinCodeResponse>(
        "/api/mobile/join-codes",
        {
          method: "POST",
          body: JSON.stringify({ class_id: classId, student_id: studentId }),
        },
      );
      setJoinCode(result);
    } catch {
      setError(
        "Could not issue a code for this learner. Refresh the roster and try again.",
      );
    } finally {
      setCreating(false);
    }
  }

  if (!supabase) {
    return (
      <section aria-labelledby="teacher-title">
        <h1 id="teacher-title">Teacher access</h1>
        <p>
          Connect Supabase to sign in and issue a one-time feature-phone code.
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section aria-labelledby="teacher-title">
        <h1 id="teacher-title">Teacher access</h1>
        <p>
          Sign in with your school-issued teacher account to issue a learner
          code.
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

  const selectedClass = classes.find((item) => item.class_id === classId);

  return (
    <section aria-labelledby="teacher-title">
      <div className="lobby-heading">
        <div>
          <p className="eyebrow">MtaaLab</p>
          <h1 id="teacher-title">Feature-phone access</h1>
          <p>
            Issue a one-time code to a learner already enrolled in one of your
            classes.
          </p>
        </div>
        <button type="button" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading your classes…</p>}
      {!loading && classes.length === 0 && !error && (
        <p>No active class learners are available for your account.</p>
      )}
      {!loading && classes.length > 0 && (
        <form
          className="auth-form teacher-code-form"
          onSubmit={(event) => void issueCode(event)}
        >
          <label>
            Class
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setStudentId("");
                setJoinCode(null);
              }}
              required
            >
              <option value="">Choose a class</option>
              {classes.map((item) => (
                <option key={item.class_id} value={item.class_id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Learner
            <select
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
                setJoinCode(null);
              }}
              required
              disabled={!selectedClass}
            >
              <option value="">Choose a learner</option>
              {selectedClass?.learners.map((learner) => (
                <option key={learner.student_id} value={learner.student_id}>
                  {learner.display_name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={!studentId || creating}>
            {creating ? "Creating…" : "Create one-time code"}
          </button>
        </form>
      )}
      {joinCode && (
        <article className="join-code-card" aria-live="polite">
          <h2>Share this code with the learner</h2>
          <output className="join-code-value">{joinCode.join_code}</output>
          <p>
            Expires {new Date(joinCode.expires_at).toLocaleString()} and can be
            used once.
          </p>
          <p>
            The learner can text JOIN followed by the code, or enter it in the
            USSD menu.
          </p>
          <p>
            Keep this code private. It will not be shown again after you leave
            this page.
          </p>
        </article>
      )}
      <p className="teacher-privacy-note">
        Linking a phone enables play only. Optional reminders require the
        learner to text OPT IN; STOP ends reminders without deleting game
        progress.
      </p>
    </section>
  );
}
