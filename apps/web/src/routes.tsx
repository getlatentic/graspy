import { createBrowserRouter, type RouteObject } from "react-router";
import LandingPage from "@/features/landing/pages/landing-page";
import AppEntry from "@/app/entry";
import { requireAccount } from "@/app/chat-gate";
import { chatLinks } from "@/app/chat-link";
import { lazyPage } from "@/app/page-chunks";
import { tryChat, tryLink } from "@/app/try-link";
import { RootLayout } from "@/app/route-focus";
import { AppShell, PageLoading, RouteError } from "@/app/shell";

export const routes: RouteObject[] = [
  {
    ErrorBoundary: RouteError,
    Component: RootLayout,
    children: [
      { path: "/", Component: LandingPage },
      {
        path: "/privacy",
        lazy: async () => ({
          Component: (await import("@/features/legal/pages/privacy-page"))
            .default,
        }),
      },
      {
        path: "/delete-account",
        lazy: async () => ({
          Component: (
            await import("@/features/legal/pages/delete-account-page")
          ).default,
        }),
      },
      {
        path: "/tv-diagnostics",
        lazy: async () => ({
          Component: (
            await import("@/features/diagnostics/pages/tv-diagnostics-page")
          ).default,
        }),
      },
      { path: "/link", lazy: lazyPage("tvLink") },
      tryLink,
      ...chatLinks,
      {
        path: "/app",
        Component: AppShell,
        HydrateFallback: PageLoading,
        children: [
          { index: true, Component: AppEntry },
          { path: "onboarding", lazy: lazyPage("onboarding") },
          { path: "learners", lazy: lazyPage("learners") },
          { path: "sign-in", lazy: lazyPage("signIn") },
          { path: "sign-in/phone", lazy: lazyPage("tvSignIn") },
          {
            path: "learn",
            lazy: lazyPage("learnLayout"),
            children: [
              { index: true, lazy: lazyPage("home") },
              { path: "subjects", lazy: lazyPage("subjects") },
              { path: "you", lazy: lazyPage("you") },
              { path: "you/details", lazy: lazyPage("details") },
              { path: "you/learners", lazy: lazyPage("manageLearners") },
              {
                path: "you/learners/:learnerId/voice",
                lazy: lazyPage("learnerVoice"),
              },
              {
                loader: requireAccount,
                children: [
                  { path: "ask", lazy: lazyPage("ask") },
                  tryChat,
                  { path: "ask/:subject", lazy: lazyPage("chat") },
                  { path: "ask/subject/:subjectSlug", lazy: lazyPage("chat") },
                  { path: "ask/:subject/:topicIndex", lazy: lazyPage("chat") },
                ],
              },
              { path: "plan", lazy: lazyPage("plan") },
              { path: "voice", lazy: lazyPage("voice") },
              { path: "voice/lesson", lazy: lazyPage("voiceLesson") },
              { path: ":subject", lazy: lazyPage("subject") },
              { path: ":subject/lesson/:topicIndex", lazy: lazyPage("lesson") },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
