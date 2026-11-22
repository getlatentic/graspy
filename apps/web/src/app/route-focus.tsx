import { useEffect } from "react";
import { Outlet, useLocation } from "react-router";

const TITLE = "main h1, [role='main'] h1, h1";
const TRIES = 20;
const WAIT_MS = 50;

/**
 * A new screen starts with focus on its title, so a keyboard or a remote begins
 * at the top of what it is looking at, and a reader says where it is. It waits
 * for a screen that is still loading, and leaves focus alone where the screen
 * has already put it on a control.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const settled = document.activeElement;
      if (settled && settled !== document.body) return clearInterval(timer);
      const title = document.querySelector<HTMLElement>(TITLE);
      if (title) {
        if (!title.hasAttribute("tabindex")) title.tabIndex = -1;
        title.focus({ preventScroll: true });
        clearInterval(timer);
      } else if (tries >= TRIES) {
        clearInterval(timer);
      }
    }, WAIT_MS);
    return () => clearInterval(timer);
  }, [pathname]);
  return null;
}

/** The root of every route: the focus of a new screen, then the screen. */
export function RootLayout() {
  return (
    <>
      <RouteFocus />
      <Outlet />
    </>
  );
}
