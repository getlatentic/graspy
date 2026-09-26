// The tutor's reply, drawn as the web draws it: its markdown and KaTeX maths, never its HTML, and links
// only to the web, opened by the app.
(() => {
  "use strict";
  const app = window.graspyReply;
  if (!app) return;
  const root = document.getElementById("reply");

  // As the web's processLatex: \( \) and \[ \] become the $ and $$ the maths reader takes.
  const latex = (text) =>
    text
      .replace(/<latex-block>|<\/latex-block>/g, "$$$$")
      .replace(/<latex-inline>|<\/latex-inline>/g, "$")
      .replace(/\\\[|\\\]/g, "$$$$")
      .replace(/\\\(|\\\)/g, "$");

  const escape = (text) =>
    text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Model output echoes learner input: KaTeX never trusts it, so \href cannot become a live link.
  const maths = (tex, displayMode) =>
    katex.renderToString(tex, { displayMode, strict: false, throwOnError: false, errorColor: "inherit", trust: false });

  const WEB_LINK = /^https?:\/\//i;

  marked.use({
    gfm: true,
    extensions: [
      {
        name: "blockMath",
        level: "block",
        start: (src) => src.indexOf("$$"),
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$(?:\n+|$)/.exec(src);
          if (match) return { type: "blockMath", raw: match[0], text: match[1].trim() };
        },
        renderer: (token) => `<p>${maths(token.text, true)}</p>`,
      },
      {
        name: "inlineMath",
        level: "inline",
        start: (src) => src.indexOf("$"),
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$/.exec(src) || /^\$((?:\\.|[^\\$\n])+?)\$/.exec(src);
          if (match) return { type: "inlineMath", raw: match[0], text: match[1].trim(), display: match[0].startsWith("$$") };
        },
        renderer: (token) => maths(token.text, token.display),
      },
    ],
    renderer: {
      html: ({ text }) => escape(text),
      heading({ tokens }) {
        return `<p class="heading">${this.parser.parseInline(tokens)}</p>`;
      },
      link({ href, tokens }) {
        const text = this.parser.parseInline(tokens);
        return WEB_LINK.test(href) ? `<a href="${escape(href)}">${text}</a>` : text;
      },
      image: ({ text }) => escape(text),
      table(token) {
        return `<div class="table">${marked.Renderer.prototype.table.call(this, token)}</div>`;
      },
      list(token) {
        const html = marked.Renderer.prototype.list.call(this, token);
        return token.ordered ? html.replace(/^<ol(\s[^>]*)?>/, (open) => open.replace("<ol", '<ol class="reply-steps"')) : html;
      },
    },
  });

  const report = () => app.postMessage(JSON.stringify({ kind: "height", px: Math.ceil(root.getBoundingClientRect().height) }));
  new ResizeObserver(report).observe(root);

  document.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link) return;
    event.preventDefault();
    app.postMessage(JSON.stringify({ kind: "open", href: link.href }));
  });

  app.onmessage = (event) => {
    const { text } = JSON.parse(event.data);
    root.innerHTML = marked.parse(latex(text));
    report();
  };

  app.postMessage(JSON.stringify({ kind: "ready" }));
})();
