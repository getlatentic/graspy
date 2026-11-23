/**
 * A stable name for a control, so focus can be found again after the screen is
 * drawn anew. It is where the control is (its landmark: `main`, `nav`, `aside`,
 * `header`, `footer` or a `[data-focus-scope]`, with its label), what it is (its
 * `data-focus-key`, or a link's `href`) and which of those it is within that
 * landmark, so two links to one place, or one item in a menu and one in the page,
 * are told apart. Never a position among all controls. A control in a dialog
 * has none: the dialog gives focus back to what opened it.
 */
const LANDMARK =
  "[data-focus-scope],main,[role='main'],nav,aside,header,footer";
const DIALOG =
  "[role='dialog'],[role='alertdialog'],[aria-modal='true'],dialog";
const FOCUSABLE = "a, button, input, select, textarea, [tabindex]";

const quote = (value: string) => value.replace(/["\\]/g, "\\$&");

function nameOf(scope: Element | null): string {
  if (!scope) return "page";
  const label =
    scope.getAttribute("data-focus-scope") ?? scope.getAttribute("aria-label");
  return `${scope.tagName.toLowerCase()}:${label ?? ""}`;
}

function selectorFor(kind: string, value: string): string {
  return kind === "key"
    ? `[data-focus-key="${quote(value)}"]`
    : `a[href="${quote(value)}"]`;
}

function describe(el: Element) {
  const keyed = el.closest("[data-focus-key]");
  if (keyed) {
    return {
      kind: "key",
      value: keyed.getAttribute("data-focus-key") ?? "",
      host: keyed,
    };
  }
  const link = el.closest("a[href]");
  return link
    ? { kind: "href", value: link.getAttribute("href") ?? "", host: link }
    : null;
}

export function focusKeyOf(el: Element): string | null {
  if (el.closest(DIALOG)) return null;
  const found = describe(el);
  if (!found) return null;
  const scope = el.closest(LANDMARK);
  const same = (scope ?? el.ownerDocument).querySelectorAll(
    selectorFor(found.kind, found.value),
  );
  const nth = [...same].indexOf(found.host);
  return JSON.stringify([nameOf(scope), found.kind, found.value, nth]);
}

/** The control a key names now, searched only in the landmark it was recorded in. */
export function findByFocusKey(doc: Document, key: string): HTMLElement | null {
  const [name, kind, value, nth] = JSON.parse(key) as [
    string,
    string,
    string,
    number,
  ];
  const scopes: ParentNode[] =
    name === "page"
      ? [doc]
      : [...doc.querySelectorAll(LANDMARK)].filter((s) => nameOf(s) === name);
  for (const scope of scopes) {
    const host = scope.querySelectorAll<HTMLElement>(selectorFor(kind, value))[
      nth
    ];
    if (!host) continue;
    return host.matches(FOCUSABLE)
      ? host
      : host.querySelector<HTMLElement>(FOCUSABLE);
  }
  return null;
}
