import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { BookOpenCheck, Loader2, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ProviderButtons } from "@/components/auth/provider-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const REDIRECT_KEY = "studymate.redirect";

/** Only same-origin paths are allowed as post-sign-in destinations. */
function safePath(value: string | undefined | null): string {
  if (!value) return "/smart-revision";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("/auth")) return "/smart-revision";
    return url.pathname + url.search;
  } catch {
    return "/smart-revision";
  }
}

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — StudyMate AI" },
      { name: "description", content: "Sign in to StudyMate AI to save your flashcards and revision progress." },
      { property: "og:title", content: "Sign in — StudyMate AI" },
      { property: "og:description", content: "Sign in to StudyMate AI to save your flashcards and revision progress." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function AuthPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<{ email: string; kind: "confirm" | "reset" } | null>(null);

  const goNext = () => {
    const stored = sessionStorage.getItem(REDIRECT_KEY);
    sessionStorage.removeItem(REDIRECT_KEY);
    void navigate({ to: safePath(redirect ?? stored), replace: true });
  };

  useEffect(() => {
    if (redirect) sessionStorage.setItem(REDIRECT_KEY, redirect);
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) goNext();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) goNext();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return void toast.error("Enter your email");
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSentTo({ email: email.trim(), kind: "reset" });
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth`, data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) setSentTo({ email: email.trim(), kind: "confirm" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <div className="animate-rise text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-hero text-primary-foreground shadow-lift">
          <BookOpenCheck className="size-6" />
        </span>
        <h1 className="mt-4 text-3xl font-bold">
          {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {mode === "forgot"
            ? "We'll email you a link to choose a new password."
            : "Save your flashcards and revision progress across devices."}
        </p>
      </div>

      <div className="animate-rise rounded-3xl border border-border bg-card p-6 shadow-soft sm:p-7">
        {sentTo ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <MailCheck className="size-10 text-primary" />
            <p className="font-semibold">Check your inbox</p>
            <p className="text-sm text-muted-foreground">
              {sentTo.kind === "confirm"
                ? `We sent a confirmation link to ${sentTo.email}. Click it to finish creating your account.`
                : `If an account exists for ${sentTo.email}, a password reset link is on its way.`}
            </p>
            <Button variant="outline" className="mt-2 rounded-xl" onClick={() => { setSentTo(null); setMode("signin"); }}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            {mode !== "forgot" && (
              <>
                <ProviderButtons onSignedIn={goNext} />
                <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}
            <form onSubmit={submit} className="flex flex-col gap-4">
              {mode === "signup" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Himanshi" autoComplete="name" />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </div>
              {mode !== "forgot" && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    {mode === "signin" && (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                  />
                </div>
              )}
              <Button type="submit" disabled={busy} className="h-11 rounded-xl font-semibold">
                {busy && <Loader2 className="animate-spin" />}
                {mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
              </Button>
            </form>
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>New to StudyMate AI?{" "}<button className="font-semibold text-primary hover:underline" onClick={() => setMode("signup")}>Create an account</button></>
              ) : (
                <>Already have an account?{" "}<button className="font-semibold text-primary hover:underline" onClick={() => setMode("signin")}>Sign in</button></>
              )}
            </p>
          </>
        )}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">← Back to home</Link>
      </p>
    </div>
  );
}
