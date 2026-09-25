function comparable(text: string): string {
  return text
    .replace(/[*_`#:.?!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// The model often opens a slide's body with the slide's title again, as a
// heading or a bold line; shown under the real title it reads as a stutter.
export function withoutRepeatedTitle(body: string, title: string): string {
  const match = body.match(/^\s*(?:#{1,6}[ \t]+)?(.+?)[ \t]*(?:\r?\n|$)/);
  if (!match || !title.trim()) return body;
  if (comparable(match[1]) !== comparable(title)) return body;
  return body.slice(match[0].length).replace(/^\s+/, "");
}
