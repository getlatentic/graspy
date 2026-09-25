import { Navigate } from "react-router";
import { hasCompletedOnboarding } from "@/lib/user-storage";

export default function AppEntry() {
  const destination = hasCompletedOnboarding()
    ? "/app/learn"
    : "/app/onboarding";
  return <Navigate to={destination} replace />;
}
