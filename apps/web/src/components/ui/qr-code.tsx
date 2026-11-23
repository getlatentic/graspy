import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { qrPath, type QrDrawing } from "@/lib/qr-path";

/** A QR code made here, in the page: the text never leaves the device. Always dark on white,
 * whatever the theme, which is what scanners read. */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [drawn, setDrawn] = useState<QrDrawing | null>(null);

  useEffect(() => {
    let current = true;
    qrPath(value)
      .then((made) => current && setDrawn(made))
      .catch((error: unknown) => console.warn("The QR code failed:", error));
    return () => {
      current = false;
    };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${drawn?.size ?? 1} ${drawn?.size ?? 1}`}
      shapeRendering="crispEdges"
      className={cn("aspect-square rounded-control bg-white", className)}
    >
      {drawn && <path d={drawn.path} fill="#000" />}
    </svg>
  );
}
