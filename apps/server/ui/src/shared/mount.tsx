import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-600.css";
import "./view.css";

export function mount(view: ReactNode) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>{view}</StrictMode>,
  );
}
