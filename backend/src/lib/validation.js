import { HttpError } from './errors.js';

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'Invalid request', result.error.flatten());
  }
  return result.data;
}