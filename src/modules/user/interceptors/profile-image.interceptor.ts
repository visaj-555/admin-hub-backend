import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import { newId } from '../../../common/utils/ids.js';

const imageExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const profileImageInterceptor = FileInterceptor('profileImage', {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      const directory = join(process.cwd(), 'uploads', 'profile-images');
      mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },
    filename: (_request, file, callback) => {
      callback(null, `${newId()}${imageExtensions[file.mimetype]}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!imageExtensions[file.mimetype]) {
      callback(
        new BadRequestException('Profile image must be JPEG, PNG, or WebP'),
        false,
      );
      return;
    }
    callback(null, true);
  },
});
