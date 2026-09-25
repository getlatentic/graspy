const STEPS = [
  {
    title: "Tell graspy about your class",
    description:
      "Pick your language, country and class level. graspy maps out the subjects and topics for that syllabus.",
  },
  {
    title: "Learn one lesson at a time",
    description:
      "Each topic is a short set of slides with worked examples and a quick check at the end.",
  },
  {
    title: "Ask when you are stuck",
    description:
      "The tutor sits beside every lesson. Ask in your own words and it explains, step by step.",
  },
];

export function HowItWorks() {
  return (
    <ol className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-10">
      {STEPS.map((step, index) => (
        <li key={step.title} className="relative flex gap-5 md:block">
          {index < STEPS.length - 1 && (
            <span
              className="absolute start-4.75 top-12 -bottom-6 w-px bg-accent-line md:start-12 md:-end-8 md:top-5 md:bottom-auto md:h-px md:w-auto"
              aria-hidden="true"
            />
          )}
          <span
            className="nums relative flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent"
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <div className="pt-1.5 md:pt-5">
            <h3 className="font-sans font-semibold">{step.title}</h3>
            <p className="mt-2 text-pretty leading-7 text-muted">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
