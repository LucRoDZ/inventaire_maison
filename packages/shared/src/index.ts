export * from './auth';
export * from './barcode';
export * from './categories';
export * from './locations';
export * from './products';
export * from './scan';
export * from './stock';

export interface HealthResponse {
  status: 'ok' | 'error';
}
