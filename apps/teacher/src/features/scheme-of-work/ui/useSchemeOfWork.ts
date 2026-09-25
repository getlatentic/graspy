import { useEffect, useState } from "react";

import { useStableAcademicContext } from "../../academic-workspace/ui/useStableAcademicContext";
import type { SchemeOfWorkGateway } from "../application/SchemeOfWorkGateway";
import type {
  ArchiveSchemeEntryRequest,
  MoveSchemeEntryRequest,
  CreateSchemeFromTemplateRequest,
  CreateSchemeOfWorkRequest,
  InstallSchemeTemplatePackageRequest,
  SaveSchemeEntryRequest,
  SaveSchemeWeekRequest,
  SchemeContextRequest,
  SchemeContextSnapshot,
} from "../domain/schemeOfWork";

type SchemeState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly snapshot: SchemeContextSnapshot;
      readonly pendingAction: string | null;
      readonly actionError: string | null;
    };

export function useSchemeOfWork(
  gateway: SchemeOfWorkGateway,
  context: SchemeContextRequest,
) {
  const [state, setState] = useState<SchemeState>({ status: "loading" });
  const stableContext = useStableAcademicContext(context);

  const load = async () => {
    setState({ status: "loading" });
    try {
      const snapshot = await gateway.getContext(context);
      setState({
        status: "ready",
        snapshot,
        pendingAction: null,
        actionError: null,
      });
    } catch (error) {
      setState({ status: "failed", message: errorMessage(error) });
    }
  };

  useEffect(() => {
    let current = true;
    setState({ status: "loading" });
    gateway
      .getContext(stableContext)
      .then((snapshot) => {
        if (current) {
          setState({
            status: "ready",
            snapshot,
            pendingAction: null,
            actionError: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (current) {
          setState({ status: "failed", message: errorMessage(error) });
        }
      });
    return () => {
      current = false;
    };
  }, [gateway, stableContext]);

  const mutate = async (
    action: string,
    operation: () => Promise<SchemeContextSnapshot>,
  ) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, pendingAction: action, actionError: null }
        : current,
    );
    try {
      const snapshot = await operation();
      setState({
        status: "ready",
        snapshot,
        pendingAction: null,
        actionError: null,
      });
      return true;
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              pendingAction: null,
              actionError: errorMessage(error),
            }
          : current,
      );
      return false;
    }
  };

  const createScheme = (request: Omit<CreateSchemeOfWorkRequest, "context">) =>
    mutate("create-scheme", () =>
      gateway.createScheme({ ...request, context }),
    );
  const saveWeek = (request: Omit<SaveSchemeWeekRequest, "context">) =>
    mutate(`save-week-${request.weekId}`, () =>
      gateway.saveWeek({ ...request, context }),
    );
  const createSchemeFromTemplate = (request: Omit<CreateSchemeFromTemplateRequest, "context">) =>
    mutate("create-scheme-from-template", () =>
      gateway.createSchemeFromTemplate({ ...request, context }),
    );
  const installTemplatePackage = (packageContents: string) =>
    mutate("install-template-package", () =>
      gateway.installTemplatePackage({
        context,
        packageContents,
      } satisfies InstallSchemeTemplatePackageRequest),
    );
  const saveEntry = (request: Omit<SaveSchemeEntryRequest, "context">) =>
    mutate(`save-entry-${request.weekId}`, () =>
      gateway.saveEntry({ ...request, context }),
    );
  const archiveEntry = (entryId: string) =>
    mutate(`archive-entry-${entryId}`, () =>
      gateway.archiveEntry({ context, entryId } satisfies ArchiveSchemeEntryRequest),
    );
  const moveEntry = (entryId: string, targetWeekId: string) =>
    mutate(`move-entry-${entryId}`, () =>
      gateway.moveEntry({ context, entryId, targetWeekId } satisfies MoveSchemeEntryRequest),
    );

  return {
    state,
    reload: load,
    createScheme,
    createSchemeFromTemplate,
    installTemplatePackage,
    saveWeek,
    saveEntry,
    archiveEntry,
    moveEntry,
  };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The scheme of work could not be updated. Try again.";
}
