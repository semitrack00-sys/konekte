export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function notFound(): never { throw new AppError(404, 'NOT_FOUND', 'This item is not available.'); }
