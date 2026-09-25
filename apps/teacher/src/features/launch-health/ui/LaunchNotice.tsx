import { ActionableNotification, InlineNotification } from "@carbon/react";

import { describeLaunchFailure, type LaunchFailure } from "../domain/launchHealth";

interface LaunchNoticeProps {
  readonly failure: LaunchFailure;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}

/**
 * Reports a startup failure that left the workspace usable, so what is missing
 * is stated up front rather than discovered later as an unrelated fault.
 */
export function LaunchNotice({ failure, retrying, onRetry }: LaunchNoticeProps) {
  const description = describeLaunchFailure(failure);

  if (!description.retryable) {
    return (
      <InlineNotification
        className="w-full max-w-full"
        kind="warning"
        lowContrast
        hideCloseButton
        role="status"
        title={description.title}
        subtitle={description.explanation}
      />
    );
  }

  return (
    <ActionableNotification
      className="w-full max-w-full"
      kind="warning"
      lowContrast
      inline
      hideCloseButton
      role="status"
      title={description.title}
      subtitle={description.explanation}
      actionButtonLabel={retrying ? "Trying again…" : "Try again"}
      onActionButtonClick={onRetry}
    />
  );
}
