// index.css MUST be the first stylesheet the app loads: it declares the cascade
// layer order, and the browser pins a layer's position at its first mention —
// any feature css (all in @layer components) loading earlier would demote
// components below Tailwind's base layer.
import "./styles/index.css";
import "./styles/carbon.scss";
import "./styles/fonts.css";
import "katex/dist/katex.min.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";

import { routes } from "./app/App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("The application root element is missing.");
}

// Browser history: real paths, and every screen is addressable. Navigation is
// client-side so it never asks Tauri's asset protocol for a path — the window
// boots at "/" and moves via links. The one gap is a hard reload onto a deep
// path in the packaged app, where the protocol resolves by file and would 404;
// there is no reload affordance in the shipped window, and a Rust index.html
// fallback closes it if that ever changes. Launch health and model setup gate
// every route from the top of the tree.
const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
