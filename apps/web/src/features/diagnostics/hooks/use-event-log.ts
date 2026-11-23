import { useEffect, useState } from "react";
import { createEventStore } from "../lib/event-store";

/** The store of the last events the page was sent (keys, pointer, focus), kept in memory only, listening while the page is shown. */
export function useEventStore() {
  const [store] = useState(createEventStore);
  useEffect(() => store.listen(document), [store]);
  return store;
}
