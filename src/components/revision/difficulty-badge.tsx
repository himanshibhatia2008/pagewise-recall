import { cn } from "@/lib/utils";

const styles = {
  easy: "bg-success-soft text-success",
  medium: "bg-sky-soft text-sky",
  hard: "bg-destructive-soft text-destructive",
} as const;

export function DifficultyBadge({ value, className }: { value: string; className?: string }) {
  const key = (value in styles ? value : "medium") as keyof typeof styles;
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", styles[key], className)}>
      {key}
    </span>
  );
}
