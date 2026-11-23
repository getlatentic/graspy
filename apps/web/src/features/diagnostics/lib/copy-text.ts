/** Copies text with the async clipboard, else the old selection route that a TV browser may still have. Resolves whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyBySelection(text);
  }
}

function copyBySelection(text: string): boolean {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.setAttribute("data-nav-skip", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  const before = document.activeElement;
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (before instanceof HTMLElement) before.focus();
  }
}
