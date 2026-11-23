/**
 * A stable name for a control, so focus can be found again after the screen is
 * drawn anew: its `data-focus-key`, or for a link in the page's main area its
 * `href`. An index would point at another item once the list changes.
 */
export function focusKeyOf(el: Element): string | null {
  const keyed = el.closest("[data-focus-key]");
  if (keyed) return `key:${keyed.getAttribute("data-focus-key")}`;
  const link = el.closest("a[href]");
  if (link && link.closest("main, [role='main']")) {
    return `href:${link.getAttribute("href")}`;
  }
  return null;
}

const quote = (value: string) => value.replace(/["\\]/g, "\\$&");

/** The control a key names now, if the screen has it. */
export function findByFocusKey(
  root: ParentNode,
  key: string,
): HTMLElement | null {
  const [kind, ...rest] = key.split(":");
  const value = quote(rest.join(":"));
  const selector =
    kind === "key"
      ? `[data-focus-key="${value}"]`
      : `main a[href="${value}"], [role="main"] a[href="${value}"]`;
  const host = root.querySelector<HTMLElement>(selector);
  if (!host) return null;
  return host.matches("a, button, input, select, textarea, [tabindex]")
    ? host
    : host.querySelector<HTMLElement>(
        "a, button, input, select, textarea, [tabindex]",
      );
}
