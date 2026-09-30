export const CHAT_CONFIG = {
  IMAGE: {
    MAX_COUNT: 1,
    DAILY_LIMIT: 2,
    MAX_SIZE_MB: 20,
    MAX_SIZE_BYTES: 20 * 1024 * 1024,
    ALLOWED_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'] as const,
  },

  PRESIGNED_URL_EXPIRATION: 900,
} as const;

// -------- TYPE HELPERS -------- //
export type ImageExtension =
  (typeof CHAT_CONFIG.IMAGE.ALLOWED_EXTENSIONS)[number];
