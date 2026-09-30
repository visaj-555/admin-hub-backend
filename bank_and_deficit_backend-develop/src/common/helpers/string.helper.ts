// =============== Trim and Lower Case Of String =============== //
export function normalizeString(value?: string | null): string {
  return (value ?? '').trim().toLowerCase();
}

// =============== Trimming The String ================= //
export function safeTrim(value?: string | null): string {
  return (value ?? '').trim();
}
