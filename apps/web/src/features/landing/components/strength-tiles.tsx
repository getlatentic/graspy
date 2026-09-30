import type { ReactNode } from "react";
import {
  Check,
  GraduationCap,
  Store,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

function Tile({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col rounded-3xl bg-canvas p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-accent-ink">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-5 font-sans font-semibold">{title}</h3>
      <div className="mt-auto pt-6" aria-hidden="true">
        {children}
      </div>
    </li>
  );
}

const CLASSES = ["Primary 4", "JSS 2", "SS 1"];

export function StrengthTiles() {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Tile icon={GraduationCap} title="For your class">
        <div className="flex flex-wrap gap-2">
          {CLASSES.map((name) => (
            <span
              key={name}
              className="rounded-full bg-surface px-3 py-1 text-sm font-medium text-ink"
            >
              {name}
            </span>
          ))}
        </div>
      </Tile>

      <Tile icon={Store} title="Examples from home">
        <p className="rounded-xl bg-surface px-4 py-3 text-sm leading-6 text-ink">
          Ada buys 3 oranges at ₦50 each. How much does she pay?
        </p>
      </Tile>

      <Tile icon={WifiOff} title="Works offline">
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-sm">
          <span className="truncate font-medium text-ink">Number systems</span>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent-ink">
            <Check className="size-3.5" />
            On this device
          </span>
        </div>
      </Tile>
    </ul>
  );
}
