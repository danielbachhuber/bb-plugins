// Where a row came from, drawn the way bb draws its own icons: Hugeicons
// outlines at a 1.5 stroke, in the muted text color. GitHub and Gmail use the
// outline icons bb already has. Hugeicons has no Todoist mark, so it is drawn
// here: Hugeicons' own rounded square with Todoist's three stacked checks.
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export type Brand = "todoist" | "gmail" | "github";

const TITLE: Record<Brand, string> = { todoist: "Todoist", gmail: "Gmail", github: "GitHub" };

/** Hugeicons' SquareIcon outline, so the mark sits in the same family. */
const SQUARE =
  "M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z";

function TodoistMark({ className }: { className?: string }) {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={TITLE.todoist}
      className={className}
    >
      <title>{TITLE.todoist}</title>
      <path d={SQUARE} />
      <path d="M7 8.5L10 10.25L17 7" />
      <path d="M7 12.25L10 14L17 10.75" />
      <path d="M7 16L10 17.75L17 14.5" />
    </svg>
  );
}

export function BrandIcon({ brand, className }: { brand: Brand; className?: string }) {
  const classes = cn("shrink-0 text-muted-foreground", className);
  if (brand === "todoist") return <TodoistMark className={classes} />;
  return <Icon name={brand === "github" ? "Github" : "Mail"} className={classes} aria-label={TITLE[brand]} />;
}
