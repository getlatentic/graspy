/** The child's loudness, a tenth of a second per bar, newest last. */
export function VoiceWave({ levels }: { levels: number[] }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-12 items-center justify-center gap-1"
    >
      {levels.map((level, index) => (
        <span
          key={index}
          className="w-1.5 rounded-full bg-accent"
          style={{ height: `${Math.max(8, level * 100)}%` }}
        />
      ))}
    </div>
  );
}
