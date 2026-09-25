import { invoke } from "@tauri-apps/api/core";

import type { NativeInvoke } from "../../academic-workspace/infrastructure/TauriAcademicWorkspaceGateway";
import type { SchemeOfWorkGateway } from "../application/SchemeOfWorkGateway";
import {
  schemeContextSnapshotSchema,
  type ArchiveSchemeEntryRequest,
  type MoveSchemeEntryRequest,
  type CreateSchemeFromTemplateRequest,
  type CreateSchemeOfWorkRequest,
  type InstallSchemeTemplatePackageRequest,
  type SaveSchemeEntryRequest,
  type SaveSchemeWeekRequest,
  type SchemeContextRequest,
  type SchemeContextSnapshot,
} from "../domain/schemeOfWork";

export class TauriSchemeOfWorkGateway implements SchemeOfWorkGateway {
  constructor(private readonly nativeInvoke: NativeInvoke = invoke) {}

  getContext(request: SchemeContextRequest): Promise<SchemeContextSnapshot> {
    return this.call("get_scheme_of_work_context", { request });
  }

  createScheme(
    request: CreateSchemeOfWorkRequest,
  ): Promise<SchemeContextSnapshot> {
    return this.call("create_scheme_of_work", { request });
  }

  createSchemeFromTemplate(
    request: CreateSchemeFromTemplateRequest,
  ): Promise<SchemeContextSnapshot> {
    return this.call("create_scheme_from_template", { request });
  }

  installTemplatePackage(
    request: InstallSchemeTemplatePackageRequest,
  ): Promise<SchemeContextSnapshot> {
    return this.call("install_scheme_template_package", { request });
  }

  saveWeek(request: SaveSchemeWeekRequest): Promise<SchemeContextSnapshot> {
    return this.call("save_scheme_week", { request });
  }

  saveEntry(request: SaveSchemeEntryRequest): Promise<SchemeContextSnapshot> {
    return this.call("save_scheme_entry", { request });
  }

  archiveEntry(
    request: ArchiveSchemeEntryRequest,
  ): Promise<SchemeContextSnapshot> {
    return this.call("archive_scheme_entry", { request });
  }

  moveEntry(request: MoveSchemeEntryRequest): Promise<SchemeContextSnapshot> {
    return this.call("move_scheme_entry", { request });
  }

  private async call(
    command: string,
    args: Record<string, unknown>,
  ): Promise<SchemeContextSnapshot> {
    const payload = await this.nativeInvoke<unknown>(command, args);
    return schemeContextSnapshotSchema.parse(payload);
  }
}
