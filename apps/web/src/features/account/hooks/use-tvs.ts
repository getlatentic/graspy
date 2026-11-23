import { useCallback, useEffect, useState } from "react";
import { listTvs, removeTv, type TvDevice } from "@/lib/account/tv-link-api";

/** The TVs signed in to the account, once the parent is signed in again to see them; empty while
 * they load or when the list cannot be read. `refused` hears of the parent's session being gone. */
export function useTvs(enabled: boolean, refused: (error: unknown) => boolean) {
  const [tvs, setTvs] = useState<TvDevice[]>([]);

  const reload = useCallback(() => {
    listTvs()
      .then(setTvs)
      .catch((error: unknown) => {
        if (!refused(error)) console.warn("Listing the TVs failed:", error);
      });
  }, [refused]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const remove = useCallback(
    (id: string) => {
      removeTv(id)
        .then(reload)
        .catch((error: unknown) => {
          if (refused(error)) return;
          console.warn("Removing a TV failed:", error);
          reload();
        });
    },
    [reload, refused],
  );

  return { tvs, reload, remove };
}
