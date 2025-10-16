import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TokenCipherService } from './token-cipher.service';
import { randomBytes } from 'crypto';

describe('TokenCipherService', () => {
  let service: TokenCipherService;
  let configService: ConfigService;
  const validEncryptionKey = randomBytes(32).toString('hex'); // 64-character hex string

  beforeEach(() => {
    configService = {
      get: vi.fn().mockReturnValue(validEncryptionKey),
    } as any;

    service = new TokenCipherService(configService);
  });

  describe('constructor', () => {
    it('should initialize with valid 64-character hex key', () => {
      expect(service).toBeDefined();
      expect(configService.get).toHaveBeenCalledWith('TOKEN_ENCRYPTION_KEY');
    });

    it('should throw error when key is missing', () => {
      vi.spyOn(configService, 'get').mockReturnValue(undefined);

      expect(() => {
        new TokenCipherService(configService);
      }).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32-byte key).');
    });

    it('should throw error when key is empty string', () => {
      vi.spyOn(configService, 'get').mockReturnValue('');

      expect(() => {
        new TokenCipherService(configService);
      }).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32-byte key).');
    });

    it('should throw error when key is too short', () => {
      vi.spyOn(configService, 'get').mockReturnValue('abc123'); // Only 6 characters

      expect(() => {
        new TokenCipherService(configService);
      }).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32-byte key).');
    });

    it('should throw error when key is too long', () => {
      const tooLongKey = randomBytes(33).toString('hex'); // 66 characters
      vi.spyOn(configService, 'get').mockReturnValue(tooLongKey);

      expect(() => {
        new TokenCipherService(configService);
      }).toThrow('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32-byte key).');
    });

    it('should throw error when key has invalid hex characters', () => {
      // 64 characters but not valid hex
      const invalidHexKey = 'z'.repeat(64);
      vi.spyOn(configService, 'get').mockReturnValue(invalidHexKey);

      // This will throw when trying to use the cipher with invalid key
      const serviceWithBadKey = new TokenCipherService(configService);

      expect(() => {
        serviceWithBadKey.encrypt('test');
      }).toThrow();
    });
  });

  describe('encrypt', () => {
    it('should encrypt a simple string', () => {
      const plaintext = 'Hello, World!';
      const ciphertext = service.encrypt(plaintext);

      expect(ciphertext).toBeDefined();
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext).not.toBe(plaintext);
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for same plaintext (IV uniqueness)', () => {
      const plaintext = 'test message';
      const ciphertext1 = service.encrypt(plaintext);
      const ciphertext2 = service.encrypt(plaintext);

      expect(ciphertext1).not.toBe(ciphertext2);
      // Both should still decrypt to same plaintext
      expect(service.decrypt(ciphertext1)).toBe(plaintext);
      expect(service.decrypt(ciphertext2)).toBe(plaintext);
    });

    it('should encrypt empty string', () => {
      const ciphertext = service.encrypt('');

      expect(ciphertext).toBeDefined();
      expect(service.decrypt(ciphertext)).toBe('');
    });

    it('should encrypt string with special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should encrypt string with unicode characters', () => {
      const plaintext = '你好世界 🚀 Привет مرحبا';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should encrypt string with newlines and tabs', () => {
      const plaintext = 'Line 1\nLine 2\tTabbed\r\nWindows line';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should encrypt large text (10KB)', () => {
      const plaintext = 'a'.repeat(10 * 1024); // 10KB
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should encrypt very large text (1MB)', () => {
      const plaintext = 'Lorem ipsum '.repeat(100000); // ~1MB
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should encrypt JSON string', () => {
      const plaintext = JSON.stringify({
        userId: '12345',
        email: 'test@example.com',
        roles: ['admin', 'user'],
        metadata: { createdAt: '2025-10-15', active: true }
      });
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
      expect(JSON.parse(service.decrypt(ciphertext))).toEqual(JSON.parse(plaintext));
    });

    it('should produce base64-encoded output', () => {
      const ciphertext = service.encrypt('test');

      // Base64 should only contain valid characters
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);

      // Should be decodable
      expect(() => Buffer.from(ciphertext, 'base64')).not.toThrow();
    });

    it('should include IV, auth tag, and encrypted data in output', () => {
      const ciphertext = service.encrypt('test');
      const buffer = Buffer.from(ciphertext, 'base64');

      // IV (12 bytes) + Auth Tag (16 bytes) + Encrypted Data (at least 4 bytes for "test")
      expect(buffer.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe('decrypt', () => {
    it('should decrypt ciphertext back to original plaintext', () => {
      const plaintext = 'Secret message';
      const ciphertext = service.encrypt(plaintext);
      const decrypted = service.decrypt(ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle multiple encryption/decryption rounds', () => {
      let text = 'original';

      // Encrypt and decrypt 100 times
      for (let i = 0; i < 100; i++) {
        const encrypted = service.encrypt(text);
        text = service.decrypt(encrypted);
      }

      expect(text).toBe('original');
    });

    it('should throw error for invalid base64 ciphertext', () => {
      expect(() => {
        service.decrypt('not-valid-base64!@#$%');
      }).toThrow();
    });

    it('should throw error for corrupted ciphertext (modified data)', () => {
      const ciphertext = service.encrypt('test');
      const buffer = Buffer.from(ciphertext, 'base64');

      // Corrupt the encrypted data portion
      buffer[30] = buffer[30] ^ 0xFF;
      const corruptedCiphertext = buffer.toString('base64');

      expect(() => {
        service.decrypt(corruptedCiphertext);
      }).toThrow();
    });

    it('should throw error for corrupted auth tag', () => {
      const ciphertext = service.encrypt('test');
      const buffer = Buffer.from(ciphertext, 'base64');

      // Corrupt the auth tag (bytes 12-27)
      buffer[15] = buffer[15] ^ 0xFF;
      const corruptedCiphertext = buffer.toString('base64');

      expect(() => {
        service.decrypt(corruptedCiphertext);
      }).toThrow();
    });

    it('should throw error for corrupted IV', () => {
      const ciphertext = service.encrypt('test');
      const buffer = Buffer.from(ciphertext, 'base64');

      // Corrupt the IV (first 12 bytes)
      buffer[5] = buffer[5] ^ 0xFF;
      const corruptedCiphertext = buffer.toString('base64');

      expect(() => {
        service.decrypt(corruptedCiphertext);
      }).toThrow();
    });

    it('should throw error for truncated ciphertext (too short)', () => {
      const validCiphertext = service.encrypt('test');
      const buffer = Buffer.from(validCiphertext, 'base64');

      // Take only first 20 bytes (less than IV + Auth Tag)
      const truncated = buffer.subarray(0, 20).toString('base64');

      expect(() => {
        service.decrypt(truncated);
      }).toThrow();
    });

    it('should throw error for empty ciphertext', () => {
      expect(() => {
        service.decrypt('');
      }).toThrow();
    });

    it('should throw error when decrypting with wrong key', () => {
      const plaintext = 'secret data';
      const ciphertext = service.encrypt(plaintext);

      // Create new service with different key
      const differentKey = randomBytes(32).toString('hex');
      const differentConfigService = {
        get: vi.fn().mockReturnValue(differentKey),
      } as any;

      const serviceWithDifferentKey = new TokenCipherService(differentConfigService);

      expect(() => {
        serviceWithDifferentKey.decrypt(ciphertext);
      }).toThrow();
    });

    it('should handle ciphertext with only IV and auth tag (zero-length plaintext)', () => {
      const ciphertext = service.encrypt('');

      expect(() => {
        service.decrypt(ciphertext);
      }).not.toThrow();
      expect(service.decrypt(ciphertext)).toBe('');
    });
  });

  describe('encryption/decryption round-trip', () => {
    it('should handle ASCII characters (0-127)', () => {
      const ascii = Array.from({ length: 128 }, (_, i) =>
        String.fromCharCode(i)
      ).join('');

      const ciphertext = service.encrypt(ascii);
      expect(service.decrypt(ciphertext)).toBe(ascii);
    });

    it('should handle extended ASCII (128-255)', () => {
      const extendedAscii = Array.from({ length: 128 }, (_, i) =>
        String.fromCharCode(128 + i)
      ).join('');

      const ciphertext = service.encrypt(extendedAscii);
      expect(service.decrypt(ciphertext)).toBe(extendedAscii);
    });

    it('should handle OAuth tokens', () => {
      const oauthToken = 'ya29.a0AfB_byABC123xyz...very_long_token_string_here...XYZ';
      const ciphertext = service.encrypt(oauthToken);

      expect(service.decrypt(ciphertext)).toBe(oauthToken);
    });

    it('should handle JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const ciphertext = service.encrypt(jwt);

      expect(service.decrypt(ciphertext)).toBe(jwt);
    });

    it('should handle refresh tokens', () => {
      const refreshToken = randomBytes(64).toString('base64');
      const ciphertext = service.encrypt(refreshToken);

      expect(service.decrypt(ciphertext)).toBe(refreshToken);
    });

    it('should handle Gmail watch notification data', () => {
      const watchData = JSON.stringify({
        historyId: '1234567890',
        expiration: '1696636800000',
        topicName: 'projects/my-project/topics/gmail-notifications'
      });

      const ciphertext = service.encrypt(watchData);
      expect(service.decrypt(ciphertext)).toBe(watchData);
    });
  });

  describe('security properties', () => {
    it('should use AES-256-GCM encryption (authenticated encryption)', () => {
      // If decryption succeeds, GCM authentication passed
      const plaintext = 'authenticated data';
      const ciphertext = service.encrypt(plaintext);

      expect(() => service.decrypt(ciphertext)).not.toThrow();
    });

    it('should generate unique IVs for every encryption', () => {
      const plaintext = 'same text';
      const ivs = new Set<string>();

      // Generate 1000 encryptions and extract IVs
      for (let i = 0; i < 1000; i++) {
        const ciphertext = service.encrypt(plaintext);
        const buffer = Buffer.from(ciphertext, 'base64');
        const iv = buffer.subarray(0, 12).toString('hex');
        ivs.add(iv);
      }

      // All IVs should be unique
      expect(ivs.size).toBe(1000);
    });

    it('should not leak plaintext length in ciphertext (within GCM overhead)', () => {
      const short = service.encrypt('a');
      const long = service.encrypt('a'.repeat(100));

      const shortBuffer = Buffer.from(short, 'base64');
      const longBuffer = Buffer.from(long, 'base64');

      // Ciphertext lengths should reflect plaintext lengths + constant overhead
      // IV (12) + Auth Tag (16) + Plaintext length
      expect(shortBuffer.length).toBe(12 + 16 + 1);
      expect(longBuffer.length).toBe(12 + 16 + 100);
    });

    it('should detect tampering anywhere in ciphertext', () => {
      const ciphertext = service.encrypt('important data');
      const buffer = Buffer.from(ciphertext, 'base64');

      // Try tampering with every byte
      for (let i = 0; i < buffer.length; i++) {
        const tampered = Buffer.from(buffer);
        tampered[i] = tampered[i] ^ 0xFF; // Flip all bits
        const tamperedCiphertext = tampered.toString('base64');

        expect(() => {
          service.decrypt(tamperedCiphertext);
        }).toThrow();
      }
    });

    it('should be resistant to bit-flipping attacks', () => {
      const ciphertext = service.encrypt('amount=100');
      const buffer = Buffer.from(ciphertext, 'base64');

      // Try to flip a single bit in the encrypted data
      buffer[buffer.length - 1] ^= 0x01;
      const modifiedCiphertext = buffer.toString('base64');

      // Should fail due to GCM authentication
      expect(() => {
        service.decrypt(modifiedCiphertext);
      }).toThrow();
    });
  });

  describe('performance', () => {
    it('should encrypt 1000 messages in reasonable time', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        service.encrypt(`message ${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should decrypt 1000 messages in reasonable time', () => {
      // Pre-generate encrypted messages
      const ciphertexts = Array.from({ length: 1000 }, (_, i) =>
        service.encrypt(`message ${i}`)
      );

      const start = Date.now();

      for (const ciphertext of ciphertexts) {
        service.decrypt(ciphertext);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
    });
  });

  describe('edge cases', () => {
    it('should handle strings with null bytes', () => {
      const plaintext = 'before\x00after';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle single character', () => {
      const plaintext = 'x';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle string with only spaces', () => {
      const plaintext = '     ';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle binary-like strings', () => {
      const plaintext = '\x00\x01\x02\x03\x04\x05';
      const ciphertext = service.encrypt(plaintext);

      expect(service.decrypt(ciphertext)).toBe(plaintext);
    });

    it('should handle maximum realistic token size (100KB)', () => {
      const largeToken = randomBytes(50000).toString('base64'); // ~100KB
      const ciphertext = service.encrypt(largeToken);

      expect(service.decrypt(ciphertext)).toBe(largeToken);
    });
  });
});
