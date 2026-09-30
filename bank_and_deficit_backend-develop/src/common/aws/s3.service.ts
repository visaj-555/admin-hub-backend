import { Injectable, Logger } from '@nestjs/common';
import { BadRequestException } from '../exceptions';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as uuid from 'uuid';
import { extname, basename } from 'path';
import * as mime from 'mime-types';

@Injectable()
export class S3Service {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly s3BaseUrl: string;
  private readonly logger = new Logger(S3Service.name);

  // ============== DIFFERENT IMAGE TYPES SUPPORTED FOR DOCUMENTS ===========//

  private readonly allowedImageTypes: Record<string, string[]> = {
    // FOR IMAGE
    '.jpg': ['image/jpeg', 'image/jpg'],
    '.jpeg': ['image/jpeg', 'image/jpg'],
    '.webp': ['image/webp'],
    '.png': ['image/png'],
    '.jfif': ['image/jpeg', 'image/pjpeg'],
    '.heic': ['image/heic', 'image/heif', 'image/x-heic'],
    '.heif': ['image/heif', 'image/x-heif'],
    '.gif': ['image/gif'],
  };

  constructor() {
    this.bucket = process.env.AWS_BUCKET_NAME ?? '';
    this.s3BaseUrl = process.env.AWS_S3_URL ?? '';

    if (!this.bucket || !this.s3BaseUrl) {
      throw new Error(
        'AWS_BUCKET_NAME and AWS_S3_URL must be defined in environment variables',
      );
    }

    this.s3 = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async onModuleInit() {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1,
      });
      await this.s3.send(command);
      this.logger.log('✅ S3 service connected successfully');
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn('⚠️ S3 service connection failed:', errorMessage);
    }
  }
  // ==============  VALIDATION FUNCTION FOR DIFFERENT FILE TYPE  ===========//

  private validateImageType(fileName: string, mimeType: string): void {
    const fileExtension = extname(fileName).toLowerCase();
    const allowedMimeTypes = this.allowedImageTypes[fileExtension];

    if (!allowedMimeTypes) {
      throw new BadRequestException(
        'INVALID_FILE_EXTENSION',
        'aws.s3.fileExtensionNotAllowed',
        {
          fileExtension,
          allowed: Object.keys(this.allowedImageTypes).join(', '),
        },
      );
    }

    if (!allowedMimeTypes.includes(mimeType)) {
      throw new BadRequestException(
        'INVALID_MIME_TYPE',
        'aws.s3.mimeTypeNotAllowed',
        {
          mimeType,
          fileExtension,
          allowed: allowedMimeTypes.join(', '),
        },
      );
    }
  }

  // ============== VALIDATE IMAGE INTEGRITY (CORRUPTION CHECK) ===========//

  validateImageIntegrity(buffer: Buffer, fileExtension: string): void {
    if (!buffer || buffer.length < 12) {
      throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
        reason: 'File is too small or empty',
      });
    }

    const extension = fileExtension.toLowerCase();
    const header = buffer.subarray(0, 12);

    if (
      extension === '.jpg' ||
      extension === '.jpeg' ||
      extension === '.jfif'
    ) {
      if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid JPEG file signature',
        });
      }
      return;
    }

    if (extension === '.png') {
      const pngSignature = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      if (!header.subarray(0, 8).equals(pngSignature)) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid PNG file signature',
        });
      }
      return;
    }

    if (extension === '.webp') {
      const riffSignature = Buffer.from([0x52, 0x49, 0x46, 0x46]); // RIFF
      const webpSignature = Buffer.from([0x57, 0x45, 0x42, 0x50]); // WEBP

      if (!header.subarray(0, 4).equals(riffSignature)) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid WebP file signature (missing RIFF)',
        });
      }

      if (!header.subarray(8, 12).equals(webpSignature)) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid WebP file signature (missing WEBP)',
        });
      }
      return;
    }

    if (extension === '.gif') {
      const gif87a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]); // GIF87a
      const gif89a = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a

      const header6 = buffer.subarray(0, 6);
      if (!header6.equals(gif87a) && !header6.equals(gif89a)) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid GIF file signature',
        });
      }
      return;
    }

    if (extension === '.heic' || extension === '.heif') {
      const ftypSignature = Buffer.from([0x66, 0x74, 0x79, 0x70]); // ftyp
      if (buffer.length < 12) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid HEIC/HEIF file (too small)',
        });
      }

      const ftypAt4 = buffer.subarray(4, 8);
      if (!ftypAt4.equals(ftypSignature)) {
        throw new BadRequestException('CORRUPT_IMAGE', 'aws.s3.corruptImage', {
          reason: 'Invalid HEIC/HEIF file signature (missing ftyp)',
        });
      }
      return;
    }
  }

  // ============== VALIDATE VIDEO INTEGRITY (CORRUPTION CHECK) =========== //

  validateVideoIntegrity(buffer: Buffer, fileExtension: string): void {
    if (!buffer || buffer.length < 12) {
      throw new BadRequestException('CORRUPT_VIDEO', 'aws.s3.corruptVideo', {
        reason: 'File is too small or empty',
      });
    }

    const extension = fileExtension.toLowerCase();
    const header = buffer.subarray(0, 12);

    if (extension === '.mp4' || extension === '.mov') {
      const ftypSignature = Buffer.from([0x66, 0x74, 0x79, 0x70]); // "ftyp"
      if (!header.subarray(4, 8).equals(ftypSignature)) {
        throw new BadRequestException('CORRUPT_VIDEO', 'aws.s3.corruptVideo', {
          reason: 'Invalid MP4/MOV file signature (missing ftyp)',
        });
      }
      return;
    }

    if (extension === '.mkv' || extension === '.webm') {
      const ebmlSignature = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
      if (!header.subarray(0, 4).equals(ebmlSignature)) {
        throw new BadRequestException('CORRUPT_VIDEO', 'aws.s3.corruptVideo', {
          reason: 'Invalid MKV/WebM file signature (missing EBML)',
        });
      }
      return;
    }
  }

  private validateFileType(
    fileName: string,
    mimeType: string,
    allowedExtensions?: readonly string[],
    allowedMimeTypes?: readonly string[],
  ): void {
    const fileExtension = extname(fileName).toLowerCase();

    // If custom allowed extensions are provided, use them
    if (allowedExtensions && allowedMimeTypes) {
      if (!allowedExtensions.includes(fileExtension)) {
        throw new BadRequestException(
          'INVALID_FILE_EXTENSION',
          'aws.s3.fileExtensionNotAllowed',
          {
            fileExtension,
            allowed: allowedExtensions.join(', '),
          },
        );
      }

      if (!allowedMimeTypes.includes(mimeType)) {
        throw new BadRequestException(
          'INVALID_MIME_TYPE',
          'aws.s3.mimeTypeNotAllowed',
          {
            mimeType,
            fileExtension,
            allowed: allowedMimeTypes.join(', '),
          },
        );
      }
      return;
    }

    // Fall back to image validation for backward compatibility
    this.validateImageType(fileName, mimeType);
  }

  // ==============  UPLOAD IMAGE FILE FOR BANNER AND PROFILE TO S3  ===========//
  async uploadImageFile(
    file: Express.Multer.File,
    folder: string,
    metadata?: Record<string, string>,
  ): Promise<{ fileName: string; fileUrl: string }> {
    if (!file) {
      throw new BadRequestException('NO_FILE', 'aws.s3.noFileProvided');
    }

    const fileExtension = extname(file.originalname).toLowerCase();

    const mimeLookupResult: string | false = mime.lookup(fileExtension);
    const mimeType =
      (typeof mimeLookupResult === 'string' ? mimeLookupResult : false) ||
      file.mimetype ||
      'application/octet-stream';

    this.validateImageType(file.originalname, mimeType);
    this.validateImageIntegrity(file.buffer, fileExtension);

    const baseFileName = basename(file.originalname, fileExtension);

    const fileName = `${uuid.v4()}-${baseFileName}${fileExtension}`;
    const key = `${folder}/${fileName}`.replace(/\/+/g, '/');

    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: mimeType,
      CacheControl: 'max-age=31536000',
      Metadata: metadata,
    };

    try {
      const upload = new Upload({
        client: this.s3,
        params,
        queueSize: 4,
        partSize: 5 * 1024 * 1024,
      });

      await upload.done();
      // Ensure proper s3:// format (don't collapse the protocol slashes)
      let fileUrl = `${this.s3BaseUrl}/${key}`;
      // Fix s3:/ to s3:// if needed
      fileUrl = fileUrl.replace(/^s3:\//, 's3://');
      // Collapse multiple slashes except in s3:// protocol
      fileUrl = fileUrl
        .replace(/s3:\/\/+/g, 's3://')
        .replace(/([^:])\/\/+/g, '$1/');
      this.logger.log(`Successfully uploaded file: ${key}`);
      return { fileName, fileUrl };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to upload file: ${errorMessage}`, errorStack);
      throw new BadRequestException('UPLOAD_FAILED', 'aws.s3.uploadFailed', {
        errorMessage,
      });
    }
  }

  // ==============  BUFFER FUNCTION TO USED WITH UPLOAD FILE  ===========//
  async uploadBuffer(
    buffer: Buffer,
    folder: string,
    fileName: string,
    contentType?: string,
    metadata?: Record<string, string>,
  ): Promise<{ fileName: string; fileUrl: string }> {
    const fileExtension = extname(fileName).toLowerCase();

    const mimeLookupResult: string | false = mime.lookup(fileExtension);
    const mimeType =
      contentType ||
      (typeof mimeLookupResult === 'string' ? mimeLookupResult : false) ||
      'application/octet-stream';

    this.validateImageType(fileName, mimeType);
    this.validateImageIntegrity(buffer, fileExtension);

    const key = `${folder}/${fileName}`.replace(/\/+/g, '/');

    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'max-age=31536000',
      Metadata: metadata,
    };

    try {
      const upload = new Upload({
        client: this.s3,
        params,
        queueSize: 4,
        partSize: 5 * 1024 * 1024,
      });

      await upload.done();
      // Ensure proper s3:// format (don't collapse the protocol slashes)
      let fileUrl = `${this.s3BaseUrl}/${key}`;
      // Fix s3:/ to s3:// if needed
      fileUrl = fileUrl.replace(/^s3:\//, 's3://');
      // Collapse multiple slashes except in s3:// protocol
      fileUrl = fileUrl
        .replace(/s3:\/\/+/g, 's3://')
        .replace(/([^:])\/\/+/g, '$1/');
      this.logger.log(`Successfully uploaded buffer: ${key}`);
      return { fileName, fileUrl };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to upload buffer: ${errorMessage}`, errorStack);
      throw new BadRequestException(
        'UPLOAD_FAILED',
        'aws.s3.bufferUploadFailed',
        {
          errorMessage,
        },
      );
    }
  }

  // ==============  DELETE FUNCTION FROM S3  ===========//
  async deleteFile(fileName: string, folder: string): Promise<void> {
    const key = `${folder}/${fileName}`.replace(/\/+/g, '/');

    const params = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      await this.s3.send(new DeleteObjectCommand(params));
      this.logger.log(`Successfully deleted file: ${key}`);
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete file: ${key}`, errorStack);
      throw new BadRequestException('DELETE_FAILED', 'aws.s3.deleteFailed', {
        fileName,
      });
    }
  }

  // ==============  MOVING FROM TEMP TO PERMANENT FOLDER  ===========//
  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    const copySource = `${this.bucket}/${sourceKey}`.replace(/\/+/g, '/');
    try {
      await this.s3.send(
        new CopyObjectCommand({
          Bucket: this.bucket,
          CopySource: copySource,
          Key: destKey,
        }),
      );
      this.logger.log(`Copied S3 object: ${sourceKey} → ${destKey}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to copy S3 object ${sourceKey} to ${destKey}: ${errorMessage}`,
      );
      throw new BadRequestException('COPY_FAILED', 'aws.s3.copyFailed', {
        sourceKey,
        destKey,
      });
    }
  }

  /** Delete an object by its S3 key. */
  async deleteObjectByKey(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.log(`Deleted S3 object: ${key}`);
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete S3 object ${key}`, errorStack);
      throw new BadRequestException('DELETE_FAILED', 'aws.s3.deleteFailed', {
        key,
      });
    }
  }

  // ==============  DELETE FILE BY S3 URI  ===========//
  async deleteFileByUri(s3Uri: string): Promise<void> {
    const key = this.extractKeyFromS3Uri(s3Uri);
    if (!key) {
      throw new BadRequestException('INVALID_S3_URI', 'aws.s3.invalidS3Uri', {
        s3Uri,
      });
    }

    const params = {
      Bucket: this.bucket,
      Key: key,
    };

    try {
      await this.s3.send(new DeleteObjectCommand(params));
      this.logger.log(`Successfully deleted file by URI: ${key}`);
    } catch (error: unknown) {
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to delete file by URI: ${key}`, errorStack);
      throw new BadRequestException('DELETE_FAILED', 'aws.s3.deleteFailed', {
        s3Uri,
      });
    }
  }

  // ==============  PRE SIGNED URL TO DIRECTLY UPLOAD FROM FRONTEND  ===========//

  async generatePresignedUrl(
    folder: string,
    desiredFileName: string,
    fileType: string,
    allowedExtensions?: readonly string[],
    allowedMimeTypes?: readonly string[],
  ): Promise<{ url: string; key: string }> {
    if (!folder || !desiredFileName || !fileType) {
      throw new BadRequestException(
        'MISSING_PARAMS',
        'aws.s3.presignedUrlParamsMissing',
      );
    }

    const fileExtension = extname(desiredFileName).toLowerCase();
    const mimeLookupResult: string | false = mime.lookup(fileExtension);
    const mimeType =
      (typeof mimeLookupResult === 'string' ? mimeLookupResult : false) ||
      fileType ||
      'application/octet-stream';

    this.validateFileType(
      desiredFileName,
      mimeType,
      allowedExtensions,
      allowedMimeTypes,
    );

    const key = `${folder}/${desiredFileName}`.replace(/\/+/g, '/');

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
      ChecksumAlgorithm: undefined,
    });

    try {
      const url = await getSignedUrl(this.s3, command, {
        expiresIn: 900,
      });

      return { url, key };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to generate pre-signed URL: ${errorMessage}`,
        errorStack,
      );
      throw new BadRequestException(
        'PRESIGNED_URL_GENERATION_FAILED',
        'aws.s3.presignedUrlGenerationFailed',
        { errorMessage },
      );
    }
  }

  async getSignedUrl(
    input: string,
    folder?: string,
    expiresIn = 86400,
  ): Promise<string | null> {
    if (!input) {
      return null;
    }

    let key: string;

    if (folder) {
      key = `${folder}/${input}`.replace(/\/+/g, '/');
    } else if (input.startsWith('s3:/')) {
      const extractedKey = this.extractKeyFromS3Uri(input);
      if (!extractedKey) {
        return null;
      }
      key = extractedKey;
    } else {
      key = input.replace(/\/+/g, '/');
    }

    try {
      await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { expiresIn },
      );

      this.logger.log(`Generated signed URL for: ${key}`);
      return url;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'NotFound'
      ) {
        this.logger.warn(`File not found: ${key}`);
        return null;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Error generating signed URL: ${errorMessage}`,
        errorStack,
      );
      return null;
    }
  }

  private extractKeyFromS3Uri(s3Uri: string): string | null {
    let normalizedUri = s3Uri;
    if (s3Uri.startsWith('s3:/') && !s3Uri.startsWith('s3://')) {
      normalizedUri = s3Uri.replace(/^s3:\//, 's3://');
    }

    if (!normalizedUri.startsWith('s3://')) {
      return s3Uri;
    }

    // Remove s3:// prefix
    const pathPart = normalizedUri.substring(5);

    const bucketName = this.bucket;
    const bucketIndex = pathPart.indexOf(bucketName);

    if (bucketIndex !== -1) {
      const afterBucket = pathPart.substring(bucketIndex + bucketName.length);
      return afterBucket.startsWith('/')
        ? afterBucket.substring(1)
        : afterBucket;
    }

    const firstSlashIndex = pathPart.indexOf('/');
    if (firstSlashIndex !== -1) {
      return pathPart.substring(firstSlashIndex + 1);
    }

    this.logger.warn(`Could not extract key from S3 URI: ${s3Uri}`);
    return null;
  }

  // ==============  PROVIDES META DATA ABOUT FILE   ===========//

  async headObject(key: string): Promise<{
    ContentLength: number;
    ContentType?: string;
    Metadata?: Record<string, string>;
  }> {
    const params = {
      Bucket: this.bucket,
      Key: key.replace(/\/+/g, '/'),
    };

    try {
      const response = await this.s3.send(new HeadObjectCommand(params));

      if (response.ContentLength === undefined) {
        throw new BadRequestException(
          'CONTENT_LENGTH_UNAVAILABLE',
          'aws.s3.contentLengthUnavailable',
        );
      }

      this.logger.log(`Successfully retrieved metadata for: ${key}`);

      return {
        ContentLength: response.ContentLength,
        ContentType: response.ContentType ?? 'application/octet-stream',
        Metadata: response.Metadata,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to retrieve metadata for: ${key}`, errorStack);
      throw new BadRequestException(
        'METADATA_RETRIEVAL_FAILED',
        'aws.s3.metadataRetrievalFailed',
        { errorMessage },
      );
    }
  }

  // ==============  DOWNLOAD FILE AS BUFFER   ===========//
  async getFileBuffer(key: string): Promise<Buffer> {
    const params = {
      Bucket: this.bucket,
      Key: key.replace(/\/+/g, '/'),
    };

    try {
      const response = await this.s3.send(new GetObjectCommand(params));

      if (!response.Body) {
        throw new BadRequestException('FILE_EMPTY', 'aws.s3.fileEmpty', {
          key,
        });
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body;

      if (
        typeof stream === 'object' &&
        stream &&
        Symbol.asyncIterator in stream
      ) {
        for await (const chunk of stream as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
      } else {
        throw new BadRequestException(
          'FILE_STREAM_INVALID',
          'aws.s3.fileStreamInvalid',
          { key },
        );
      }

      const buffer = Buffer.concat(chunks);
      this.logger.log(`Successfully downloaded file buffer: ${key}`);
      return buffer;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Failed to download file buffer: ${key}`, errorStack);
      throw new BadRequestException(
        'FILE_DOWNLOAD_FAILED',
        'aws.s3.fileDownloadFailed',
        { errorMessage, key },
      );
    }
  }

  // ==============  LIST OBJECTS IN FOLDER   ===========//
  async listObjects(
    folder: string,
    afterDate?: Date,
  ): Promise<Array<{ key: string; lastModified?: Date; size?: number }>> {
    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    const params = {
      Bucket: this.bucket,
      Prefix: prefix,
    };

    try {
      const response = await this.s3.send(new ListObjectsV2Command(params));
      const objects: Array<{
        key: string;
        lastModified?: Date;
        size?: number;
      }> = [];

      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key) continue;

          // Filter by date if provided
          if (afterDate && object.LastModified) {
            if (object.LastModified < afterDate) {
              continue;
            }
          }

          objects.push({
            key: object.Key,
            lastModified: object.LastModified,
            size: object.Size,
          });
        }
      }

      this.logger.log(`Listed ${objects.length} objects in folder: ${prefix}`);
      return objects;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to list objects in folder: ${prefix}`,
        errorStack,
      );
      throw new BadRequestException(
        'LIST_OBJECTS_FAILED',
        'aws.s3.listObjectsFailed',
        {
          errorMessage,
        },
      );
    }
  }
}
