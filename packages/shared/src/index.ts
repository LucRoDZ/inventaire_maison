export * from './auth';
export * from './barcode';
export * from './categories';
export * from './home';
export * from './households';
export * from './locations';
export * from './products';
export * from './scan';
export * from './stock';
export * from './users';

export interface HealthResponse {
  status: 'ok' | 'error';
}
