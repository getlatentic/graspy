import { useEffect, useState } from "react";
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { ToolResult } from "@/lib/content";
import { directionOf, wordsFor, type Words } from "./words";

export interface Shown<C> {
  app: App;
  result: ToolResult<C>;
  words: Words;
}

export function useToolResult<C>(
  name: string,
  contentOf: (value: unknown) => C | null,
): Shown<C> | null {
  const [result, setResult] = useState<ToolResult<C> | null>(null);
  const [context, setContext] = useState<McpUiHostContext>({});
  const { app, error } = useApp({
    appInfo: { name, version: "1.0.0" },
    capabilities: { availableDisplayModes: ["inline"] },
    onAppCreated: (created) => {
      created.ontoolresult = (params) => {
        const sent = params as Partial<ToolResult<unknown>>;
        const content = contentOf(sent.structuredContent);
        if (content !== null && typeof sent._meta?.viewUUID === "string") {
          setResult({
            ...(sent as ToolResult<unknown>),
            structuredContent: content,
          });
        }
      };
      created.onhostcontextchanged = (changed) =>
        setContext((current) => ({ ...current, ...changed }));
    },
  });

  useEffect(() => {
    if (app) setContext((current) => ({ ...app.getHostContext(), ...current }));
  }, [app]);

  const locale = context.locale ?? "en";
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = directionOf(locale);
  }, [locale]);

  useEffect(() => {
    if (error) console.error(`${name} could not reach its host:`, error);
  }, [error, name]);

  return app && result ? { app, result, words: wordsFor(locale) } : null;
}
