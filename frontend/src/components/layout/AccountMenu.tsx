import { useEffect, useState } from "react";
import { Info, LogOut, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getSupabaseClient } from "@/services/supabase";

/**
 * Account controls reflect real Supabase Auth state only. When auth is not
 * configured for this installation the menu says so instead of offering a
 * sign-in that cannot work.
 */
export function AccountMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    setReady(true);
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const initial = (user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          aria-label="Account controls"
          title="Account controls"
        >
          <span
            aria-hidden="true"
            className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground text-[0.65rem] font-bold"
          >
            {ready ? initial : <UserRound size={14} strokeWidth={2} />}
          </span>
          <span className="hidden sm:inline">Account</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          {user ? (user.email ?? "Signed in") : "Account"}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem
            onSelect={() => {
              void getSupabaseClient()?.auth.signOut();
            }}
          >
            <LogOut aria-hidden="true" size={16} strokeWidth={2} />
            <span>Sign out</span>
          </DropdownMenuItem>
        ) : (
          <div className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
            <Info aria-hidden="true" size={14} className="mb-1" />
            {ready
              ? "No account is signed in. Ask your teacher how to access this class."
              : "Sign-in is not configured for this installation."}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
