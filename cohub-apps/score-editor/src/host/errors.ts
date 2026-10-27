/** The HTTP status an SDK error carries, or null for an error that is not one. */
export function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function codeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

/** A versioned write refused because the file changed since it was read. */
export function isConflict(error: unknown): boolean {
  return statusOf(error) === 409 && codeOf(error) === "file_conflict";
}
