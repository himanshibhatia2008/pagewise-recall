import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { keys, type Deck } from "@/lib/data/queries";

export function DeckFormDialog({ deck, trigger, onSaved }: { deck?: Deck; trigger: ReactNode; onSaved?: (id: string) => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(deck?.name ?? "");
      setSubject(deck?.subject ?? "");
      setUnit(deck?.unit ?? "");
      setDescription(deck?.description ?? "");
    }
  }, [open, deck]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return void toast.error("Give your deck a name.");
    setBusy(true);
    const values = { name: name.trim(), subject: subject.trim() || null, unit: unit.trim() || null, description: description.trim() || null };
    const res = deck
      ? await supabase.from("decks").update(values).eq("id", deck.id).select("id").single()
      : await supabase.from("decks").insert(values).select("id").single();
    setBusy(false);
    if (res.error) return void toast.error("Couldn't save the deck", { description: res.error.message });
    toast.success(deck ? "Deck updated" : "Deck created");
    await queryClient.invalidateQueries({ queryKey: keys.decks });
    setOpen(false);
    onSaved?.(res.data.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-3xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{deck ? "Edit deck" : "New deck"}</DialogTitle>
            <DialogDescription>Organise cards by subject and unit, e.g. “Biology · Unit 2: Cells”.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-form-name">Name</Label>
            <Input id="deck-form-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-form-subject">Subject</Label>
              <Input id="deck-form-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Biology" maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deck-form-unit">Unit</Label>
              <Input id="deck-form-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit 2" maxLength={120} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-form-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <Textarea id="deck-form-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy} className="rounded-xl">{busy && <Loader2 className="animate-spin" />} {deck ? "Save changes" : "Create deck"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
