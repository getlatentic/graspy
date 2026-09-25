interface Props {
  readonly onStartBlank: () => void;
  readonly onDraftWithGraspy: () => void;
  readonly onBringYourOwn: () => void;
}

/**
 * The three ways to start a lesson, as cards a teacher picks between.
 *
 * Writing it, having graspy draft it, and bringing an existing plan are equal
 * choices offered up front, so the surface hosting them — the empty class or a
 * deliberate "New lesson" — only supplies the frame and the routing.
 */
export function LessonStartRoutes({
  onStartBlank,
  onDraftWithGraspy,
  onBringYourOwn,
}: Props) {
  const routes = [
    {
      key: "blank",
      title: "Write it myself",
      description: "Write the plan yourself.",
      onClick: onStartBlank,
      primary: false,
      icon: (
        <>
          <rect x="2" y="26" width="28" height="2" />
          <path d="M25.4,9c0.8-0.8,0.8-2,0-2.8l-3.6-3.6c-0.8-0.8-2-0.8-2.8,0l-15,15V24h6.4L25.4,9z M20.4,4L24,7.6l-3,3L17.4,7L20.4,4z M6,22v-3.6l10-10l3.6,3.6l-10,10H6z" />
        </>
      ),
    },
    {
      key: "draft",
      title: "Let graspy draft it",
      // The other two routes open a form; this one commits the engine on the
      // click. Reading like its neighbours, it took a teacher by surprise.
      description:
        "graspy starts writing now, from your topic and goals. It takes a few minutes, and you can carry on elsewhere.",
      onClick: onDraftWithGraspy,
      primary: true,
      icon: (
        <>
          <path d="M16 2l2.9 8.6L28 13l-9.1 2.4L16 24l-2.9-8.6L4 13l9.1-2.4z" />
          <path d="M25 22l1.2 3.8L30 27l-3.8 1.2L25 32l-1.2-3.8L20 27l3.8-1.2z" />
        </>
      ),
    },
    {
      key: "upload",
      title: "Paste a plan I already have",
      description: "Paste a plan you already have and graspy structures it.",
      onClick: onBringYourOwn,
      primary: false,
      icon: (
        <>
          <path d="M6 18H4v10a2 2 0 0 0 2 2h20a2 2 0 0 0 2-2V18h-2v10H6z" />
          <path d="M7 12l1.41 1.41L15 6.83V24h2V6.83l6.59 6.58L25 12 16 3z" />
        </>
      ),
    },
  ] as const;

  return (
    <div className="grid gap-md min-[38rem]:grid-cols-3 max-w-[52rem]">
      {routes.map((route) => (
        <button
          key={route.key}
          type="button"
          onClick={route.onClick}
          className={`grid gap-2xs content-start text-left p-md rounded-[14px] border cursor-pointer
            transition-colors hover:bg-paper-soft
            ${route.primary ? "border-brand bg-paper-accent" : "border-rule"}`}
        >
          <span
            className={`mb-2xs grid place-items-center w-8 h-8 rounded-[10px]
              ${route.primary ? "bg-brand text-paper" : "bg-paper-soft text-muted"}`}
          >
            <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor" aria-hidden="true">
              {route.icon}
            </svg>
          </span>
          <span className="text-base font-semibold text-ink">{route.title}</span>
          <span className="text-sm leading-body text-ink-secondary">{route.description}</span>
        </button>
      ))}
    </div>
  );
}
