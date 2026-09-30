import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    try {
      const credentials = await this.loadCredentials();

      if (!credentials) {
        this.logger.warn(
          'Firebase credentials not found. Push notifications are disabled.',
        );
        return;
      }

      if (admin.apps.length === 0) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(credentials),
        });

        this.logger.log('Firebase Admin SDK initialized.');
      } else {
        this.firebaseApp = admin.app();
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin SDK', error);
    }
  }

  private async loadCredentials(): Promise<admin.ServiceAccount | null> {
    const credentialPath = this.configService.get<string>(
      'FIREBASE_CREDENTIALS_PATH',
    );

    if (!credentialPath) {
      return null;
    }

    if (credentialPath.startsWith('s3://')) {
      return this.loadCredentialsFromS3(credentialPath);
    }

    return this.loadCredentialsFromFile(credentialPath);
  }

  private loadCredentialsFromFile(
    filePath: string,
  ): admin.ServiceAccount | null {
    const resolvedPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    return JSON.parse(
      fs.readFileSync(resolvedPath, 'utf8'),
    ) as admin.ServiceAccount;
  }

  private async loadCredentialsFromS3(
    s3Uri: string,
  ): Promise<admin.ServiceAccount> {
    const [, bucket, ...keyParts] = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/)!;

    const key = keyParts.join('/');

    this.logger.log(`Loading Firebase credentials from s3://${bucket}/${key}`);

    const client = new S3Client({
      region: this.configService.get<string>('AWS_REGION'),
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') ?? '',
        secretAccessKey:
          this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ?? '',
      },
    });

    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new Error('Firebase credentials file is empty.');
    }

    const chunks: Uint8Array[] = [];

    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return JSON.parse(
      Buffer.concat(chunks).toString('utf8'),
    ) as admin.ServiceAccount;
  }

  getMessaging(): admin.messaging.Messaging | null {
    return this.firebaseApp ? admin.messaging(this.firebaseApp) : null;
  }
}
