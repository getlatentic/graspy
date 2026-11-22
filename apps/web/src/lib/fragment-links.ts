/**
 * A link to a place on the same page (the skip link, "how it works") moves
 * there without adding a history entry. A native fragment link pushes one with
 * no router state, which Back could not tell from a page of the app, and then
 * Back would only undo the jump. The target takes focus, so the next Tab starts
 * from it.
 */
export function installFragmentLinks(root: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey)
      return;
    const link =
      event.target instanceof Element ? event.target.closest("a[href]") : null;
    const href = link?.getAttribute("href");
    if (!link || !href || !href.startsWith("#") || href.length < 2) return;
    const target = root.getElementById(decodeURIComponent(href.slice(1)));
    if (!target) return;
    event.preventDefault();
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  };
  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
