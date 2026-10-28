import type { Product } from '@/contracts/catalog';
export interface CatalogRepository {
  list(dataType: 'OFFICIAL' | 'MOCK' | 'REFERENCE'): Promise<Product[]>;
  find(id: string): Promise<Product | null>;
}
