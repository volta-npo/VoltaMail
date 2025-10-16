import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Redis as RedisClient } from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private client!: RedisClient;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      console.warn('[CacheService] Redis not configured - caching disabled');
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('[CacheService] Redis connection failed after 3 retries');
            return null;
          }
          return Math.min(times * 100, 2000);
        }
      });

      this.client.on('connect', () => {
        console.log('[CacheService] Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (error) => {
        console.error('[CacheService] Redis error:', error.message);
        this.isConnected = false;
      });

      await this.client.ping();
    } catch (error) {
      console.error('[CacheService] Failed to initialize Redis:', error);
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;

    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`[CacheService] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;

    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      console.error(`[CacheService] Error setting key ${key}:`, error);
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[CacheService] Error deleting key ${key}:`, error);
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;

    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error(`[CacheService] Error deleting pattern ${pattern}:`, error);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] Error checking key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{ connected: boolean; keys: number; memory: string }> {
    if (!this.isConnected) {
      return { connected: false, keys: 0, memory: '0' };
    }

    try {
      const info = await this.client.info('memory');
      const memory = info.match(/used_memory_human:([^\r\n]+)/)?.[1] || '0';
      const dbsize = await this.client.dbsize();

      return {
        connected: true,
        keys: dbsize,
        memory
      };
    } catch (error) {
      console.error('[CacheService] Error getting stats:', error);
      return { connected: false, keys: 0, memory: '0' };
    }
  }

  /**
   * Wrap a function with caching
   */
  async wrap<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Execute function and cache result
    const result = await fn();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  /**
   * Check if caching is available
   */
  isCacheAvailable(): boolean {
    return this.isConnected;
  }
}
