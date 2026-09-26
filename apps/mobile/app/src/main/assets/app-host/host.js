// graspy's MCP Apps host page on Android. The app opens a sandbox proxy on the API's origin in a frame
// here, and this page passes messages between that frame and the app: nothing else reaches the app.
(() => {
  "use strict";
  const app = window.graspyHost;
  if (!app) return;
  let frame = null;
  let viewOrigin = null;

  window.addEventListener("message", (event) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== viewOrigin) return;
    app.postMessage(JSON.stringify({ kind: "relay", origin: event.origin, data: event.data }));
  });

  function open({ src, origin, title }) {
    viewOrigin = origin;
    frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
    frame.title = title;
    frame.src = src;
    document.body.replaceChildren(frame);
  }

  app.onmessage = (event) => {
    const command = JSON.parse(event.data);
    if (command.kind === "open") open(command);
    else if (command.kind === "post" && frame) frame.contentWindow.postMessage(command.message, viewOrigin);
  };

  app.postMessage(JSON.stringify({ kind: "ready" }));
})();
