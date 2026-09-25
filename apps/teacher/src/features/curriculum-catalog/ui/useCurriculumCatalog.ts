import { useCallback, useEffect, useState } from "react";

import type { CurriculumCatalogGateway } from "../application/CurriculumCatalogGateway";
import type { CurriculumCatalogSnapshot } from "../domain/curriculumCatalog";

type CurriculumCatalogState =
  | { readonly status: "loading" }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "ready";
      readonly catalog: CurriculumCatalogSnapshot;
      readonly installing: boolean;
      readonly error: string | null;
    };

export function useCurriculumCatalog(gateway: CurriculumCatalogGateway) {
  const [state, setState] = useState<CurriculumCatalogState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const catalog = await gateway.getCatalog();
      setState({ status: "ready", catalog, installing: false, error: null });
    } catch (error) {
      setState({ status: "failed", message: errorMessage(error) });
    }
  }, [gateway]);

  useEffect(() => {
    void load();
  }, [load]);

  const installPackage = async (packageContents: string) => {
    setState((current) =>
      current.status === "ready"
        ? { ...current, installing: true, error: null }
        : current,
    );
    try {
      const catalog = await gateway.installPackage({ packageContents });
      setState({ status: "ready", catalog, installing: false, error: null });
      return true;
    } catch (error) {
      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              installing: false,
              error: errorMessage(error),
            }
          : current,
      );
      return false;
    }
  };

  return { state, reload: load, installPackage };
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The curriculum library could not be updated. Try again.";
}
