export const POST_CONFIG = {
  IMAGE: {
    MAX_COUNT: 1,
    MAX_SIZE_MB: 10,
    MAX_SIZE_BYTES: 10 * 1024 * 1024,
    ALLOWED_TYPES: [
      'image/jpg',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/pjpeg',
      'image/heic',
      'image/heif',
      'image/x-heic',
      'image/x-heif',
    ],
    ALLOWED_EXTENSIONS: [
      '.jpg',
      '.jpeg',
      '.png',
      '.webp',
      '.jfif',
      '.heic',
      '.heif',
    ] as const,
  },

  VIDEO: {
    MAX_COUNT: 1,
    MAX_SIZE_MB: 100,
    MAX_SIZE_BYTES: 100 * 1024 * 1024,
    /** Max video length allowed at temp presigned URL generation (30 seconds). */
    MAX_DURATION_MS: 30_000,
    MAX_DURATION_SECONDS: 30,
    ALLOWED_TYPES: [
      'video/mp4',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
      'video/x-msvideo',
    ],
    ALLOWED_EXTENSIONS: ['.mp4', '.mov', '.mkv', '.webm', '.avi'] as const,
  },

  PRESIGNED_URL_EXPIRATION: 900,

  TEMP_URL_MAX_FILES: 1,
  CAPTION_GENERATION_MAX_PER_DAY: 150,
} as const;

// Type helpers for file extensions
export type ImageExtension =
  (typeof POST_CONFIG.IMAGE.ALLOWED_EXTENSIONS)[number];
export type VideoExtension =
  (typeof POST_CONFIG.VIDEO.ALLOWED_EXTENSIONS)[number];
