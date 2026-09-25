import "../../styles/index.css";
import "../../styles/carbon.scss";
import "../../styles/fonts.css";
import { createRoot } from "react-dom/client";

import type { LaunchHealthGateway } from "../../features/launch-health/application/LaunchHealthGateway";
import type { LaunchFailure } from "../../features/launch-health/domain/launchHealth";
import { LaunchBoundary } from "../../features/launch-health/ui/LaunchBoundary";

function stuckOn(failure: LaunchFailure): LaunchHealthGateway {
  return {
    check: () => Promise.resolve(failure),
    retry: () => Promise.resolve(failure),
  };
}

const refusedContent: LaunchFailure = {
  code: "included-content-unavailable",
  detail:
    "curriculum package nerdc-jss1-mathematics-september-2025 refused: a package is already installed under this identity with different contents (recorded digest 278b771e…a26e6, supplied digest 91ac0d34…b7f12)",
};

const outdatedApp: LaunchFailure = {
  code: "needs-app-update",
  detail:
    "The lesson library was created by a newer version of graspy (library version 25, this app supports up to 24).",
};

createRoot(document.getElementById("root")!).render(
  <>
    <LaunchBoundary gateway={stuckOn(refusedContent)}>
      <p>unreachable</p>
    </LaunchBoundary>
    <LaunchBoundary gateway={stuckOn(outdatedApp)}>
      <p>unreachable</p>
    </LaunchBoundary>
  </>,
);
