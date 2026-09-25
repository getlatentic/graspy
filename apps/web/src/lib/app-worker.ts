/** The first visit loads before public/sw.js controls it, so the worker is told what loaded. */
export function installAppWorker(): void {
  // The dev server's modules change on every save; a worker would hold on to them.
  if (import.meta.hot || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("/sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      const files = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name);
      registration.active?.postMessage({ type: "keep", urls: ["/", ...files] });
    })
    .catch((error: unknown) =>
      console.warn("The app will not open offline:", error),
    );
}
