import { useCallback, useEffect, useState } from "react";
import {
  loadLayout,
  saveLayout,
  type PaneLayout,
} from "@/features/learn/lib/pane-layout";

/** The panes' layout, kept on this device. */
export function usePaneLayout() {
  const [layout, setLayout] = useState<PaneLayout>(loadLayout);

  useEffect(() => saveLayout(layout), [layout]);

  const change = useCallback(
    (patch: Partial<PaneLayout>) =>
      setLayout((current) => ({ ...current, ...patch })),
    [],
  );

  return { layout, change };
}
