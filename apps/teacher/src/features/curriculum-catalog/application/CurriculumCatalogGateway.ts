import type {
  CurriculumCatalogSnapshot,
  InstallCurriculumPackageRequest,
} from "../domain/curriculumCatalog";

export interface CurriculumCatalogGateway {
  getCatalog(): Promise<CurriculumCatalogSnapshot>;
  installPackage(
    request: InstallCurriculumPackageRequest,
  ): Promise<CurriculumCatalogSnapshot>;
}
