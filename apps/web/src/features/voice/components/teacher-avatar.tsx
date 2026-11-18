import { cn } from "@/lib/cn";
import { TEACHER } from "../lib/teacher";

/** The teacher's portrait in a circle; the speaking one fades in over the quiet one while she talks. */
export function TeacherAvatar({
  speaking = false,
  className,
}: {
  speaking?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative block shrink-0 rounded-full", className)}
    >
      <span className="block size-full overflow-hidden rounded-full bg-accent-soft">
        <img
          src={TEACHER.portrait}
          alt=""
          width={256}
          height={256}
          decoding="async"
          className="size-full origin-top scale-125 object-cover"
        />
        <img
          src={TEACHER.portraitSpeaking}
          alt=""
          width={256}
          height={256}
          decoding="async"
          className={cn(
            "absolute inset-0 size-full origin-top scale-125 object-cover opacity-0 transition-opacity motion-reduce:transition-none",
            speaking && "opacity-100",
          )}
        />
      </span>
      {speaking && (
        <span className="absolute -inset-1 rounded-full ring-4 ring-accent-line motion-safe:animate-pulse" />
      )}
    </span>
  );
}
