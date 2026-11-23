import { useCallback, useEffect, useState } from "react";
import { listTvs, removeTv, type TvDevice } from "@/lib/account/tv-link-api";

/** The TVs signed in to the account; empty while they load or when the list cannot be read. */
export function useTvs() {
  const [tvs, setTvs] = useState<TvDevice[]>([]);

  const reload = useCallback(() => {
    listTvs()
      .then(setTvs)
      .catch((error: unknown) =>
        console.warn("Listing the TVs failed:", error),
      );
  }, []);

  useEffect(reload, [reload]);

  const remove = useCallback(
    (id: string) => {
      removeTv(id)
        .then(reload)
        .catch((error: unknown) => {
          console.warn("Removing a TV failed:", error);
          reload();
        });
    },
    [reload],
  );

  return { tvs, reload, remove };
}
