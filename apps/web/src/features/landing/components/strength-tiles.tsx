import type { ReactNode } from "react";
import {
  Check,
  Languages,
  Store,
  WifiOff,
  type LucideIcon,
} from "lucide-react";

function Tile({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <li className="flex flex-col rounded-3xl bg-canvas p-6">
      <span className="flex size-10 items-center justify-center rounded-xl bg-surface text-accent-ink">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-5 font-sans font-semibold">{title}</h3>
      <p className="mt-2 text-pretty leading-7 text-muted">{description}</p>
      <div className="mt-auto pt-6" aria-hidden="true">
        {children}
      </div>
    </li>
  );
}

const GREETINGS = [
  { text: "Welcome", lang: "en" },
  { text: "Ẹ káàbọ̀", lang: "yo" },
  { text: "أهلاً بك", lang: "ar" },
];

export function StrengthTiles() {
  return (
    <ul className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Tile
        icon={Languages}
        title="In your language"
        description="Lessons and the app itself in English, Yoruba and Arabic, with a right-to-left layout for Arabic."
      >
        <div className="flex flex-wrap gap-2">
          {GREETINGS.map(({ text, lang }) => (
            <span
              key={lang}
              lang={lang}
              dir="auto"
              className="rounded-full bg-surface px-3 py-1 text-sm font-medium text-ink"
            >
              {text}
            </span>
          ))}
        </div>
      </Tile>

      <Tile
        icon={Store}
        title="Examples from home"
        description="Money in naira, market stalls and familiar names, so a new idea makes sense the first time."
      >
        <p className="rounded-xl bg-surface px-4 py-3 text-sm leading-6 text-ink">
          Ada buys 3 oranges at ₦50 each. How much does she pay?
        </p>
      </Tile>

      <Tile
        icon={WifiOff}
        title="Light on data"
        description="Lessons you have opened stay on your device, so you can return to them without a connection."
      >
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
