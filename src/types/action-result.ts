export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
