import type { makeBusinessSocket } from '../Socket/business.js';
export type Product = Awaited<ReturnType<ReturnType<typeof makeBusinessSocket>['productCreate']>>;
export type CatalogResult = { products: Product[]; nextPageCursor?: string };
export type ProductUpdate = Partial<Pick<Product, 'name' | 'description' | 'price' | 'currency' | 'retailerId' | 'url' | 'isHidden' | 'availability'>>;
export type ProductCreate = ProductUpdate & { name: string; price: number; currency: string; images: import('./Message.js').WAMediaUpload[] };
