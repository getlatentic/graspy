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

export interface SchemeOfWorkGateway {
  getContext(request: SchemeContextRequest): Promise<SchemeContextSnapshot>;
  createScheme(
    request: CreateSchemeOfWorkRequest,
  ): Promise<SchemeContextSnapshot>;
  createSchemeFromTemplate(
    request: CreateSchemeFromTemplateRequest,
  ): Promise<SchemeContextSnapshot>;
  installTemplatePackage(
    request: InstallSchemeTemplatePackageRequest,
  ): Promise<SchemeContextSnapshot>;
  saveWeek(request: SaveSchemeWeekRequest): Promise<SchemeContextSnapshot>;
  saveEntry(request: SaveSchemeEntryRequest): Promise<SchemeContextSnapshot>;
  archiveEntry(
    request: ArchiveSchemeEntryRequest,
  ): Promise<SchemeContextSnapshot>;
  moveEntry(request: MoveSchemeEntryRequest): Promise<SchemeContextSnapshot>;
}
