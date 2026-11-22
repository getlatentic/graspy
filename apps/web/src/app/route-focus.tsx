import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router";

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
 * screen has already put it on a control.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const handled = useRef(pathname);
  const visited = useRef(false);

  useEffect(() => {
    if (handled.current === pathname) return;
    if (type === "REPLACE" && !visited.current) {
      handled.current = pathname;
      return;
    }
    let tries = 0;
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
