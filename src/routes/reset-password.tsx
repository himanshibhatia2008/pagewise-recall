import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — StudyMate AI" },
      { name: "description", content: "Set a new password for your StudyMate AI account." },
      { property: "og:title", content: "Choose a new password — StudyMate AI" },
      { property: "og:description", content: "Set a new password for your StudyMate AI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session && isRecovery) setReady(true);
      else if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return void toast.error("Use at least 8 characters.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success("Password updated");
    void navigate({ to: "/smart-revision", replace: true });
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-6">
      <div className="text-center">
        <KeyRound className="mx-auto size-10 text-primary" />
        <h1 className="mt-3 text-3xl font-bold">Choose a new password</h1>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Open this page from the reset link in your email. If the link has expired, request a new one from the sign-in page.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required disabled={!ready} />
        </div>
        <Button type="submit" disabled={!ready || busy} className="h-11 rounded-xl font-semibold">
          {busy && <Loader2 className="animate-spin" />} Save new password
        </Button>
      </form>
    </div>
  );
}
