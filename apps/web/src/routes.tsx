import { createBrowserRouter } from "react-router";
import LandingPage from "@/features/landing/pages/landing-page";
import AppEntry from "@/app/entry";
import { lazyPage } from "@/app/page-chunks";
import { AppShell, PageLoading, RouteError } from "@/app/shell";

export const router = createBrowserRouter([
  {
    ErrorBoundary: RouteError,
    children: [
      { path: "/", Component: LandingPage },
      {
        path: "/app",
        Component: AppShell,
        HydrateFallback: PageLoading,
        children: [
          { index: true, Component: AppEntry },
          { path: "onboarding", lazy: lazyPage("onboarding") },
          { path: "learners", lazy: lazyPage("learners") },
          {
            path: "learn",
            lazy: lazyPage("learnLayout"),
            children: [
              { index: true, lazy: lazyPage("home") },
              { path: "subjects", lazy: lazyPage("subjects") },
              { path: "you", lazy: lazyPage("you") },
              { path: "you/details", lazy: lazyPage("details") },
              { path: "you/learners", lazy: lazyPage("manageLearners") },
              { path: "ask", lazy: lazyPage("ask") },
              { path: "ask/:subject", lazy: lazyPage("chat") },
              { path: "ask/subject/:subjectSlug", lazy: lazyPage("chat") },
              { path: "ask/:subject/:topicIndex", lazy: lazyPage("chat") },
              { path: "plan", lazy: lazyPage("plan") },
              { path: ":subject", lazy: lazyPage("subject") },
              { path: ":subject/lesson/:topicIndex", lazy: lazyPage("lesson") },
            ],
          },
        ],
      },
    ],
  },
]);
