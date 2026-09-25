import { invoke } from "@tauri-apps/api/core";

import type { CurriculumCatalogGateway } from "../application/CurriculumCatalogGateway";
import {
  curriculumCatalogSnapshotSchema,
  type CurriculumCatalogSnapshot,
  type InstallCurriculumPackageRequest,
} from "../domain/curriculumCatalog";

type NativeInvoke = <T>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;

export class TauriCurriculumCatalogGateway implements CurriculumCatalogGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  getCatalog(): Promise<CurriculumCatalogSnapshot> {
    return this.call("get_curriculum_catalog");
  }

  installPackage(
    request: InstallCurriculumPackageRequest,
  ): Promise<CurriculumCatalogSnapshot> {
    return this.call("install_curriculum_package", { request });
  }

  private async call(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<CurriculumCatalogSnapshot> {
    const payload = await this.nativeInvoke<unknown>(command, args);
    return curriculumCatalogSnapshotSchema.parse(payload);
  }
}
