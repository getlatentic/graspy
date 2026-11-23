import { useEffect, useLayoutEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router";
import {
  hasRemembered,
  restoreFocus,
  setCurrentRoute,
} from "@/lib/focus-memory";

const TITLE = "main h1, [role='main'] h1, h1";
const TRIES = 20;
const WAIT_MS = 50;

/**
 * A screen reached by navigating starts with focus on its title, so a keyboard
 * or a remote begins at the top of what it is looking at, and a reader says
 * where it is. The first screen of a visit is left alone, so the first Tab
 * still lands on the skip link and the logo; so is a redirect from it (/app to
 * /app/learn), which is the same first screen. It waits for a screen that is
 * still loading, gives up after a second, and leaves focus alone where the
 * screen has already put it on a control. Coming back to a screen (Back, a
 * remote's Back key) puts focus on the control that had it when the person
 * left, found by its stable key once the screen has drawn it, and on the title
 * when it never appears.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const handled = useRef(pathname);
  const visited = useRef(false);

  // Before the new screen's own effects (it comes after this component), and only once the screen is committed.
  useLayoutEffect(() => setCurrentRoute(pathname), [pathname]);

  useEffect(() => {
    if (handled.current === pathname) return;
    if (type === "REPLACE" && !visited.current) {
      handled.current = pathname;
      return;
    }
    let tries = 0;
    const comeBack = type === "POP" && hasRemembered(pathname);
    // Recorded when the look is over, so a development double run of this effect still looks.
    const done = () => {
      handled.current = pathname;
      visited.current = true;
      clearInterval(timer);
    };
    const timer = setInterval(() => {
      tries += 1;
      const settled = document.activeElement;
      if (settled && settled !== document.body) return done();
      if (comeBack) {
        if (restoreFocus(pathname)) return done();
        if (tries < TRIES) return;
      }
      const title = document.querySelector<HTMLElement>(TITLE);
      if (title) {
        if (!title.hasAttribute("tabindex")) title.tabIndex = -1;
        title.focus({ preventScroll: true });
        done();
      } else if (tries >= TRIES) {
        done();
      }
    }, WAIT_MS);
    return () => clearInterval(timer);
  }, [pathname, type]);
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
