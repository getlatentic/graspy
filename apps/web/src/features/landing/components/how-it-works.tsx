const STEPS = [
  "Tell graspy your class",
  "Learn one lesson at a time",
  "Ask when you are stuck",
];

export function HowItWorks() {
  return (
    <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
      {STEPS.map((step, index) => (
        <li key={step} className="relative flex items-center gap-5 md:block">
          {index < STEPS.length - 1 && (
            <span
              className="absolute start-4.75 top-10 -bottom-8 w-px bg-accent-line md:start-12 md:-end-8 md:top-5 md:bottom-auto md:h-px md:w-auto"
              aria-hidden="true"
            />
          )}
          <span
            className="nums relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <h3 className="font-sans font-semibold md:pt-5">{step}</h3>
        </li>
      ))}
    </ol>
  );
}
