import { Navigate, type RouteObject } from "react-router";

import {
  AppBoundaries,
  WorkspaceLayout,
  HomeRoute,
  TimetableRoute,
  ClassesRoute,
  LessonsRoute,
  PlanRoute,
  ClassesManageRoute,
} from "./routeScreens";

export const routes: RouteObject[] = [
  {
    element: <AppBoundaries />,
    children: [
      {
        element: <WorkspaceLayout />,
        children: [
          { index: true, element: <HomeRoute /> },
          { path: "lessons", element: <LessonsRoute /> },
          { path: "plan", element: <PlanRoute /> },
          { path: "classes", element: <ClassesRoute /> },
          { path: "timetable", element: <TimetableRoute /> },
          { path: "classes/manage", element: <ClassesManageRoute /> },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
];
