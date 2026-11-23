/** Takes down the page's first paint (the `#boot` element in index.html) in the same frame the
 * app first draws anything, so the one is never gone before the other is there. Watching `#root`
 * rather than a component covers every first screen, an error screen included. */
export function dismissBootSplashWhenDrawn(): void {
  const splash = document.getElementById("boot");
  const root = document.getElementById("root");
  if (!splash || !root) return;
  const observer = new MutationObserver(() => {
    if (root.childElementCount === 0) return;
    observer.disconnect();
    splash.remove();
  });
  observer.observe(root, { childList: true });
}
