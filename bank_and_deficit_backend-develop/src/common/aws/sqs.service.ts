import { Injectable, Logger } from '@nestjs/common';
import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
} from '@aws-sdk/client-sqs';

export interface CompressionMediaItem {
  id: string;
  type: 'VIDEO';
  key: string;
  url: string;
  mimeType: string;
}

export interface CompressionMessagePayload {
  authId: string;
  postId: string;
  bucket: string;
  media: CompressionMediaItem;
}

@Injectable()
export class SQSService {
  private readonly sqs: SQSClient;
  private readonly compressionQueueUrl: string;
  private readonly thumbnailUrl: string;
  private readonly logger = new Logger(SQSService.name);

  constructor() {
    this.compressionQueueUrl = process.env.AWS_SQS_COMPRESSION_URL ?? '';

    if (!this.compressionQueueUrl) {
      this.logger.warn(
        'AWS_SQS_COMPRESSION_URL not configured. Compression optimization will be disabled.',
      );
    }

    this.thumbnailUrl = process.env.AWS_SQS_THUMBNAIL_URL ?? '';

    if (!this.thumbnailUrl) {
      this.logger.warn(
        'AWS_SQS_THUMBNAIL_URL not configured. Thumbnail Generation will be disabled.',
      );
    }

    this.sqs = new SQSClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  async sendCompressionMessage(
    payload: CompressionMessagePayload,
  ): Promise<void> {
    if (!this.compressionQueueUrl) {
      this.logger.warn(
        'AWS_SQS_COMPRESSION_URL not configured. Skipping compression request.',
      );
      return;
    }

    const params: SendMessageCommandInput = {
      QueueUrl: this.compressionQueueUrl,
      MessageBody: JSON.stringify(payload),
      MessageAttributes: {
        sub: {
          DataType: 'String',
          StringValue: payload.authId,
        },
        postId: {
          DataType: 'String',
          StringValue: payload.postId,
        },
      },
    };

    try {
      const isFifoQueue = this.compressionQueueUrl.endsWith('.fifo');

      const fifoParams: SendMessageCommandInput = isFifoQueue
        ? {
            ...params,

            MessageGroupId: `${payload.postId}-${payload.media.id}`,

            MessageDeduplicationId: `${payload.postId}-${payload.media.id}-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`,
          }
        : params;

      await this.sqs.send(new SendMessageCommand(fifoParams));

      this.logger.log(
        `Compression message sent (group=${fifoParams.MessageGroupId})`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Failed to send compression message: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async sendThumbnailGenerationMessage(
    postId: string,
    videoUrl: string,
    authId: string,
  ): Promise<void> {
    if (!this.thumbnailUrl) {
      this.logger.warn(
        'SQS queue URL not configured. Skipping thumbnail generation request.',
      );
      return;
    }

    const messageBody = {
      postId,
      videoUrl,
      authId,
      timestamp: new Date().toISOString(),
    };

    const params: SendMessageCommandInput = {
      QueueUrl: this.thumbnailUrl,
      MessageBody: JSON.stringify(messageBody),
      MessageAttributes: {
        postId: {
          DataType: 'String',
          StringValue: postId,
        },
        authId: {
          DataType: 'String',
          StringValue: authId,
        },
      },
    };

    try {
      const isFifoQueue = this.thumbnailUrl.endsWith('.fifo');
      const uniqueId = Buffer.from(videoUrl)
        .toString('base64')
        .substring(0, 32);

      const fifoParams: SendMessageCommandInput = isFifoQueue
        ? {
            ...params,
            MessageGroupId: uniqueId,
            MessageDeduplicationId: `${uniqueId}-${Date.now()}`,
          }
        : params;

      await this.sqs.send(new SendMessageCommand(fifoParams));
      this.logger.log(
        `Thumbnail generation message sent to SQS for post: ${postId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to send thumbnail generation message to SQS: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
