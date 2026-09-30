import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    const redisUrl =
      process.env.REDIS_HOST && process.env.REDIS_PORT
        ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`
        : (process.env.REDIS_URL ?? 'redis://localhost:6379');

    const redisPassword = process.env.REDIS_PASSWORD;

    this.client = new Redis(redisUrl, {
      password: redisPassword,
      retryStrategy: (times) => Math.min(times * 50, 2000),
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log(`Redis connected to ${redisUrl}`);
    });

    this.client.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ECONNREFUSED') {
        this.logger.error(
          `Redis connection refused. Ensure Redis is running on ${redisUrl}`,
        );
      } else {
        this.logger.error(`Redis error: ${err.message}`);
      }
    });
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async setNX(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async sadd(key: string, value: string): Promise<number> {
    return this.client.sadd(key, value);
  }

  async srem(key: string, value: string): Promise<number> {
    return this.client.srem(key, value);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async scard(key: string): Promise<number> {
    return this.client.scard(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  onModuleDestroy(): Promise<'OK'> {
    return this.client.quit();
  }
}
