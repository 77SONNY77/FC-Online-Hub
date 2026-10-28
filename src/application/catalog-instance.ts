import 'server-only';
import { createCatalogService } from './catalog';
import { catalogRepository } from '@/infrastructure/db/catalog-repository';
export const catalogService = createCatalogService(catalogRepository);
