// Keep every JSON request below the records API and hosting payload limits.
export const TRANSFER_CHUNK_BYTES = 1_500_000;
export const TRANSFER_MAX_BYTES = 32_000_000;
export const TRANSFER_TTL_MS = 60 * 60 * 1000;
