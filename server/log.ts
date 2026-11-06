/**
 * Log what went wrong without logging the data involved. A database error from the ORM carries the SQL and its
 * parameters, which here are patient values, so only the kind of error and a short, parameter-free reason are kept.
 */
export function logError(where: string, err: unknown): void {
  const e = err as { name?: string; code?: string; message?: string; cause?: { code?: string; message?: string } };
  const reason = String(e?.cause?.message ?? e?.message ?? '').split('\n')[0].replace(/\bparams?:.*$/i, '').slice(0, 160);
  console.error(`${where}: ${e?.name ?? 'Error'}${e?.code ?? e?.cause?.code ? ` [${e.code ?? e.cause?.code}]` : ''} ${reason}`.trim());
}
