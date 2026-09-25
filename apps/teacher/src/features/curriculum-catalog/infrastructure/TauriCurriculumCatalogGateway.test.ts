import { describe, expect, it, vi } from "vitest";

import { TauriCurriculumCatalogGateway } from "./TauriCurriculumCatalogGateway";

describe("TauriCurriculumCatalogGateway", () => {
  it("sends the exact curriculum file to the native installer", async () => {
    const nativeInvoke = vi.fn().mockResolvedValue({ packages: [], courses: [] });
    const gateway = new TauriCurriculumCatalogGateway(nativeInvoke);
    const request = { packageContents: "{\"schemaVersion\":1}" };

    await gateway.installPackage(request);

    expect(nativeInvoke).toHaveBeenCalledWith("install_curriculum_package", {
      request,
    });
  });

  it("rejects malformed catalog data at the infrastructure boundary", async () => {
    const gateway = new TauriCurriculumCatalogGateway(
      vi.fn().mockResolvedValue({ packages: "invalid", courses: [] }),
    );

    await expect(gateway.getCatalog()).rejects.toThrow();
  });
});
