import { Navigate } from "react-router";
import { currentAccount } from "@/lib/account/account-store";
import { hasCompletedOnboarding } from "@/lib/user-storage";

function destination(): string {
  const account = currentAccount();
  if (account && !account.learner) return "/app/learners";
  return hasCompletedOnboarding() ? "/app/learn" : "/app/onboarding";
}

export default function AppEntry() {
  return <Navigate to={destination()} replace />;
}
