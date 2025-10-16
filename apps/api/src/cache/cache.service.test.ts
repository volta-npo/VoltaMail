import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import Redis from 'ioredis';

// Mock ioredis
vi.mock('ioredis');

describe('CacheService', () => {
  let service: CacheService;
  let configService: ConfigService;
  let mockRedisClient: any;

  // Helper to create mock Redis client
  const createMockRedisClient = () => ({
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    exists: vi.fn(),
    ping: vi.fn(),
    quit: vi.fn(),
    info: vi.fn(),
    dbsize: vi.fn(),
    on: vi.fn(),
  });

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();

    // Create mock Redis client
    mockRedisClient = createMockRedisClient();
    (Redis as any).mockImplementation(() => mockRedisClient);

    // Create mock ConfigService
    configService = {
      get: vi.fn().mockReturnValue('redis://localhost:6379'),
    } as any;

    // Create service instance
    service = new CacheService(configService);
  });

  describe('onModuleInit', () => {
    it('should initialize Redis client successfully', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', {
        maxRetriesPerRequest: 3,
        retryStrategy: expect.any(Function),
      });
      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle missing Redis URL configuration', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      (configService.get as any).mockReturnValue(undefined);

      await service.onModuleInit();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CacheService] Redis not configured - caching disabled'
      );
      expect(Redis).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle Redis connection failure gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      await service.onModuleInit();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CacheService] Failed to initialize Redis:',
        expect.any(Error)
      );
      expect(service.isCacheAvailable()).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should set up retry strategy correctly', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      const redisConfig = (Redis as any).mock.calls[0][1];
      const retryStrategy = redisConfig?.retryStrategy;

      expect(retryStrategy).toBeDefined();
      if (retryStrategy) {
        expect(retryStrategy(1)).toBe(100);
        expect(retryStrategy(2)).toBe(200);
        expect(retryStrategy(3)).toBe(300);
        expect(retryStrategy(4)).toBeNull(); // Exceeds max retries
      }
    });

    it('should update connection status on connect event', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      let connectHandler: () => void;

      mockRedisClient.on.mockImplementation((event: string, handler: any) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
        return mockRedisClient;
      });
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      // Trigger connect event
      connectHandler!();

      expect(consoleSpy).toHaveBeenCalledWith('[CacheService] Redis connected');
      expect(service.isCacheAvailable()).toBe(true);

      consoleSpy.mockRestore();
    });

    it('should update connection status on error event', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      let errorHandler: (error: Error) => void;

      mockRedisClient.on.mockImplementation((event: string, handler: any) => {
        if (event === 'error') {
          errorHandler = handler;
        }
        return mockRedisClient;
      });
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      // Trigger error event
      errorHandler!(new Error('Connection lost'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CacheService] Redis error:',
        'Connection lost'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis connection on module destroy', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle destroy when Redis client is not initialized', async () => {
      (configService.get as any).mockReturnValue(undefined);

      await service.onModuleInit();
      await service.onModuleDestroy();

      // Should not throw error
      expect(mockRedisClient.quit).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      // Simulate successful connection
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should retrieve and parse cached value', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));

      const result = await service.get('test-key');

      expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(testData);
    });

    it('should return null for cache miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should return null when Redis is not connected', async () => {
      // Simulate disconnection
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      const result = await service.get('test-key');

      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.get.mockResolvedValue('invalid-json{');

      const result = await service.get('test-key');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CacheService] Error getting key'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await service.get('test-key');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should set value without TTL', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.set.mockResolvedValue('OK');

      await service.set('test-key', testData);

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(testData)
      );
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should set value with TTL', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedisClient.setex.mockResolvedValue('OK');

      await service.set('test-key', testData, 3600);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        3600,
        JSON.stringify(testData)
      );
      expect(mockRedisClient.set).not.toHaveBeenCalled();
    });

    it('should do nothing when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      await service.set('test-key', { data: 'test' });

      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should handle serialization errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const circularObj: any = {};
      circularObj.self = circularObj; // Create circular reference

      await service.set('test-key', circularObj);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CacheService] Error setting key'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await service.set('test-key', { data: 'test' });

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('del', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should delete cache key', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.del('test-key');

      expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should do nothing when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      await service.del('test-key');

      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await service.del('test-key');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CacheService] Error deleting key'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('delPattern', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should delete all keys matching pattern', async () => {
      mockRedisClient.keys.mockResolvedValue(['key1', 'key2', 'key3']);
      mockRedisClient.del.mockResolvedValue(3);

      await service.delPattern('test:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not call del when no keys match pattern', async () => {
      mockRedisClient.keys.mockResolvedValue([]);

      await service.delPattern('test:*');

      expect(mockRedisClient.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });

    it('should do nothing when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      await service.delPattern('test:*');

      expect(mockRedisClient.keys).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

      await service.delPattern('test:*');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CacheService] Error deleting pattern'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('exists', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should return true when key exists', async () => {
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists('test-key');

      expect(result).toBe(false);
    });

    it('should return false when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      const result = await service.exists('test-key');

      expect(result).toBe(false);
      expect(mockRedisClient.exists).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

      const result = await service.exists('test-key');

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should return cache statistics', async () => {
      mockRedisClient.info.mockResolvedValue('used_memory_human:1.23M\r\nother_stat:value\r\n');
      mockRedisClient.dbsize.mockResolvedValue(42);

      const stats = await service.getStats();

      expect(stats).toEqual({
        connected: true,
        keys: 42,
        memory: '1.23M',
      });
      expect(mockRedisClient.info).toHaveBeenCalledWith('memory');
      expect(mockRedisClient.dbsize).toHaveBeenCalled();
    });

    it('should return disconnected stats when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      const stats = await service.getStats();

      expect(stats).toEqual({
        connected: false,
        keys: 0,
        memory: '0',
      });
      expect(mockRedisClient.info).not.toHaveBeenCalled();
    });

    it('should handle missing memory info gracefully', async () => {
      mockRedisClient.info.mockResolvedValue('some_other_stat:value\r\n');
      mockRedisClient.dbsize.mockResolvedValue(10);

      const stats = await service.getStats();

      expect(stats).toEqual({
        connected: true,
        keys: 10,
        memory: '0',
      });
    });

    it('should handle Redis errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockRedisClient.info.mockRejectedValue(new Error('Redis error'));

      const stats = await service.getStats();

      expect(stats).toEqual({
        connected: false,
        keys: 0,
        memory: '0',
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('wrap', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should return cached value on cache hit', async () => {
      const cachedData = { name: 'cached', value: 456 };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedData));

      const fn = vi.fn().mockResolvedValue({ name: 'fresh', value: 789 });
      const result = await service.wrap('test-key', 3600, fn);

      expect(result).toEqual(cachedData);
      expect(fn).not.toHaveBeenCalled();
      expect(mockRedisClient.set).not.toHaveBeenCalled();
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should execute function and cache result on cache miss', async () => {
      const freshData = { name: 'fresh', value: 789 };
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      const fn = vi.fn().mockResolvedValue(freshData);
      const result = await service.wrap('test-key', 3600, fn);

      expect(result).toEqual(freshData);
      expect(fn).toHaveBeenCalled();
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'test-key',
        3600,
        JSON.stringify(freshData)
      );
    });

    it('should execute function when Redis is not connected', async () => {
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Disconnected'));

      const freshData = { name: 'fresh', value: 789 };
      const fn = vi.fn().mockResolvedValue(freshData);
      const result = await service.wrap('test-key', 3600, fn);

      expect(result).toEqual(freshData);
      expect(fn).toHaveBeenCalled();
      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should handle function execution errors', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      const fn = vi.fn().mockRejectedValue(new Error('Function error'));

      await expect(service.wrap('test-key', 3600, fn)).rejects.toThrow('Function error');
    });

    it('should cache falsy values except null', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.setex.mockResolvedValue('OK');

      // Test with 0
      const fn1 = vi.fn().mockResolvedValue(0);
      const result1 = await service.wrap('test-key-0', 3600, fn1);
      expect(result1).toBe(0);
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key-0', 3600, '0');

      // Test with empty string
      const fn2 = vi.fn().mockResolvedValue('');
      const result2 = await service.wrap('test-key-empty', 3600, fn2);
      expect(result2).toBe('');
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key-empty', 3600, '""');

      // Test with false
      const fn3 = vi.fn().mockResolvedValue(false);
      const result3 = await service.wrap('test-key-false', 3600, fn3);
      expect(result3).toBe(false);
      expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key-false', 3600, 'false');
    });
  });

  describe('isCacheAvailable', () => {
    it('should return true when connected', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();

      expect(service.isCacheAvailable()).toBe(true);
    });

    it('should return false when not connected', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      await service.onModuleInit();

      expect(service.isCacheAvailable()).toBe(false);
    });

    it('should return false when Redis is not configured', async () => {
      (configService.get as any).mockReturnValue(undefined);

      await service.onModuleInit();

      expect(service.isCacheAvailable()).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    beforeEach(async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      await service.onModuleInit();
      const connectHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'connect'
      )?.[1];
      connectHandler?.();
    });

    it('should handle set -> get -> del lifecycle', async () => {
      const testData = { userId: 123, name: 'John Doe' };

      // Set
      mockRedisClient.setex.mockResolvedValue('OK');
      await service.set('user:123', testData, 3600);
      expect(mockRedisClient.setex).toHaveBeenCalled();

      // Get
      mockRedisClient.get.mockResolvedValue(JSON.stringify(testData));
      const retrieved = await service.get('user:123');
      expect(retrieved).toEqual(testData);

      // Delete
      mockRedisClient.del.mockResolvedValue(1);
      await service.del('user:123');
      expect(mockRedisClient.del).toHaveBeenCalledWith('user:123');

      // Verify deleted
      mockRedisClient.get.mockResolvedValue(null);
      const afterDelete = await service.get('user:123');
      expect(afterDelete).toBeNull();
    });

    it('should handle connection loss during operation', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testData = { data: 'test' };

      // Set succeeds
      mockRedisClient.setex.mockResolvedValue('OK');
      await service.set('test-key', testData, 3600);

      // Simulate connection loss
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      )?.[1];
      errorHandler?.(new Error('Connection lost'));

      // Get should fail gracefully
      const result = await service.get('test-key');
      expect(result).toBeNull();
      expect(mockRedisClient.get).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle multiple concurrent operations', async () => {
      mockRedisClient.setex.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ value: 'test' }));

      const operations = [
        service.set('key1', { data: 1 }, 3600),
        service.set('key2', { data: 2 }, 3600),
        service.get('key3'),
        service.exists('key4'),
        service.del('key5'),
      ];

      await Promise.all(operations);

      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.get).toHaveBeenCalledTimes(1);
    });
  });
});
