import { describe, expect, it, vi } from "vitest";

import { TauriSchemeOfWorkGateway } from "./TauriSchemeOfWorkGateway";

describe("TauriSchemeOfWorkGateway", () => {
  it("maps a typed context request to the native command", async () => {
    const nativeInvoke = vi
      .fn()
      .mockResolvedValue({ scheme: null, availableTemplates: [] });
    const gateway = new TauriSchemeOfWorkGateway(nativeInvoke);
    const request = {
      academicSessionId: "session-2026",
      academicPeriodId: "period" as const,
      teachingAssignmentId: "class-mathematics",
    };

    await gateway.getContext(request);

    expect(nativeInvoke).toHaveBeenCalledWith("get_scheme_of_work_context", {
      request,
    });
  });

  it("passes an imported scheme file to the native validator", async () => {
    const nativeInvoke = vi
      .fn()
      .mockResolvedValue({ scheme: null, availableTemplates: [] });
    const gateway = new TauriSchemeOfWorkGateway(nativeInvoke);
    const request = {
      context: {
        academicSessionId: "session-2026",
        academicPeriodId: "period" as const,
        teachingAssignmentId: "class-mathematics",
      },
      packageContents: "encoded-package",
    };

    await gateway.installTemplatePackage(request);

    expect(nativeInvoke).toHaveBeenCalledWith(
      "install_scheme_template_package",
      { request },
    );
  });

  it("rejects a malformed native scheme before it reaches the UI", async () => {
    const gateway = new TauriSchemeOfWorkGateway(
      vi.fn().mockResolvedValue({ scheme: { id: "incomplete" } }),
    );

    await expect(
      gateway.getContext({
        academicSessionId: "session",
        academicPeriodId: "period",
        teachingAssignmentId: "assignment",
      }),
    ).rejects.toThrow();
  });
});
