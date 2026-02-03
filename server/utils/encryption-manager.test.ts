/**
 * Encryption Manager Unit Tests
 * 
 * Tests for EncryptionManager class and helper functions for RSA encryption management.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EncryptionManager, InvalidKeyFormatError, EncryptionNotEnabledError } from './encryption-manager.js';
import type { GoogleServiceAccountCredentials } from '../providers/google/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Valid base64-encoded RSA-4096 test keys (shortened for readability in tests)
const VALID_PUBLIC_KEY_BASE64 = "LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQ0lqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FnOEFNSUlDQ2dLQ0FnRUF3aUw1Y29NZmYvUzF4M2N0UVRFegovN0pTTTA1dE9maWM2amxYWGl2aHYyWFJRQzBTbXF4Z1hWc2IvZFdZV0dpa04zcEJMcVdoU1hyVFo4cEJEZTdqClZ2WjlwbktSanVJb3h3aVRVZWU4MUlzeVkxQzdvUTBUczlpSU56cnh6RGtTZWswb2JLMHFTV0NFUXNkc3V2bUMKQ2lJNEZQTFN2RWZCNmtZZGZjaTdjVld1UW1jc0JXMHkyYlZjVzFkQTNDSTVxV2kzdnFJVnhLZlY3ZkdYMkZkdgptRXR6Tk5OemZVS1NmaklhM1pFQmNHTHBnY0p2TU1QYlV1elJYTzRtWFltMmVxR0pONVZOeHRHcnBaM1BlRi9zCkxEL09XNXROeEgzRGcxY3NuRHZVSUh0YWo1WjFOQXZlOEVXOHl4WVJlT2Fxa1ZoZSt0dDVVYy9oUFNSV0lQYUcKeWd0VFVJUFl2MkVnSkVpTEJVd3lvQm54NUd4aTFyWG55bzZObEs4eEpNUUtKbWorYkdGeXRXbTVuL0RhY0FOMApQMTI2SHdoY3FOTm5RUVUvSHRjODMvYUFRLzNqcVpIcmtKQjVhcGcxZkcrMGY0bVA1TEJJbU5HWUl6NVhxU0JHCm5OV3RvRHJlSmxHKytaRTBIc0pNdkdWK3I0Z1ZHUFVva0NZWmJoTkNPeXdPUTczbkJDU1JnVDZ2VVFjc2kwdGQKbkNWQm00SW9MOXVZbWw3eXdJNThkSnhDK28vV2NYTjM2N3pqTVRlTFFvOWdUZGdlbGdLOFZJcS9PYXNHVU5ERwpBMEpITzl1OW11aXhQOEM3cVBnQ1lMMjRCTTRRWFg2YmVXNHB2N0NxSllrblZRZGhhajlYM21saEZzNmNEMm9OCjc4RlM4eUk2OC9IeFlrQTlMVGhScExVQ0F3RUFBUT09Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo=";

const VALID_PRIVATE_KEY_BASE64 = "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUpRZ0lCQURBTkJna3Foa2lHOXcwQkFRRUZBQVNDQ1N3d2dna29BZ0VBQW9JQ0FRRENJdmx5Z3g5LzlMWEgKZHkxQk1UUC9zbEl6VG0wNStKenFPVmRlSytHL1pkRkFMUkthckdCZFd4djkxWmhZYUtRM2VrRXVwYUZKZXRObgp5a0VON3VOVzluMm1jcEdPNGlqSENKTlI1N3pVaXpKalVMdWhEUk96MklnM092SE1PUko2VFNoc3JTcEpZSVJDCngyeTYrWUlLSWpnVTh0SzhSOEhxUmgxOXlMdHhWYTVDWnl3RmJUTFp0VnhiVjBEY0lqbXBhTGUrb2hYRXA5WHQKOFpmWVYyK1lTM00wMDNOOVFwSitNaHJka1FGd1l1bUJ3bTh3dzl0UzdORmM3aVpkaWJaNm9ZazNsVTNHMGF1bApuYzk0WCt3c1A4NWJtMDNFZmNPRFZ5eWNPOVFnZTFxUGxuVTBDOTd3UmJ6TEZoRjQ1cXFSV0Y3NjIzbFJ6K0U5CkpGWWc5b2JLQzFOUWc5aS9ZU0FrU0lzRlRES2dHZkhrYkdMV3RlZktqbzJVcnpFa3hBb21hUDVzWVhLMWFibWYKOE5wd0EzUS9YYm9mQ0Z5bzAyZEJCVDhlMXp6ZjlvQkQvZU9wa2V1UWtIbHFtRFY4YjdSL2lZL2tzRWlZMFpnagpQbGVwSUVhYzFhMmdPdDRtVWI3NWtUUWV3a3k4Wlg2dmlCVVk5U2lRSmhsdUUwSTdMQTVEdmVjRUpKR0JQcTlSCkJ5eUxTMTJjSlVHYmdpZ3YyNWlhWHZMQWpueDBuRUw2ajlaeGMzZnJ2T014TjR0Q2oyQk4yQjZXQXJ4VWlyODUKcXdaUTBNWURRa2M3MjcyYTZMRS93THVvK0FKZ3ZiZ0V6aEJkZnB0NWJpbS9zS29saVNkVkIyRnFQMWZlYVdFVwp6cHdQYWczdndWTHpJanJ6OGZGaVFEMHRPRkdrdFFJREFRQUJBb0lDQUNNaS9GM204STBTcDlIbHRvbWRrNms4ClI1ZGtvdTFDbTNmakQvYUozNjVxQ2JEaFY0UXFIYmpYMUIyaGlwUzV2N3NRdy9waTNPbTFNczBPdEs2R1pad28KT2I2bDdzVmJGb0ZMZ29wbzlHck5sTDJYNzVXckRiMVh1L092RmZOZUF3T2lzbVhWQTVuTFA3VHNiamY3RDdldwowTkN0MEVsbWZXamU3dGlFdTdROEN6R1doY2VucDNQeTJMZnBkMkpBU1lwcFd4UkVOc2RranhvbFIxUFBJM0gvCmVlYitQR0ZYNnJhdmIrQlpMZGIrOS85Vnh4VWU1YlBCQy9XVFh0dEFJUWhaODBGZG92bVFtazM3M1lDT2IrcmsKVTMrT0FNbkc3MXQyckNyTXcweHJ0d3pVOFBxT0NYZ1lUeDY4ckVYakRjMEhudzB0S3V5TlFObDFtYWNXcDNkYQpPTWs1bEpQdGFOUDU4QjYyNFRQMjVOOE5LRUhLRUlCVzB0dW91Z25laHE3cUtlUnJlTWNsTmNBNnBjeVdBVFNYCmRiREUxNzlHQ2xOd2NVQWVQdU92bGFodkR5ODUxbjI3cU5EUFI0ZHRWSm5CK3RUTTRsZjF1cHZScng4SU04VEoKZ0pQOUZlek9QRlRNSjVteWZjdHVsQ0pnV1NWSmFtLzZiaWhYTkVnMHNKS3A4T2dQV0ZyNEhJb1ZMUkUvYjlDagpMc1VIcndlbWtwUWl5V0dpSUJmeUxySk9raTc3OTBGNXJxMWwyalRydjZTMk1Vdk03eHQ1Slp1bVVLNTNhVFVMCjRiZlJsMDZDa2k2UGtabmsyOW5xZk53QU1NS2pHM0lzRW5qK1lLTGQ2YXlSV25BV0RkSWJvY0M2MGpOT3RhRmMKbmtVVWJYM1JGNkZFT2duREYyOWhBb0lCQVFEcjM2cnRWbmt1TTFZMDBrYVc3SlFBVkRlMnpKT0YvSHlGUnc5QQpLajVpZWw4Q0ZhWnZFWnlTQzV6Z25DbzdmcWZrUTVvWTE5N3ZMazgyZ2ZKbFIvRGppTnV5WnlWMVp0SGtFTUdsCmJmQ2lWQU5xNGZjalp5RlJtWk5hYTRodDA0V1RhTXpRdmdtbnpsLzVBRW5SUGZlWWtrRWdUcGszaFNqaHYzdGgKUGdTWFBvM1p6R1VmZFl5dzgxNDkwQWN6YkMwL1hyay90cmRHVlB6K2Q2RmJLTHRTSUNqMzlvT0FlUFNVNkhsMwpXcTJlWVJvQWlMUjNmYXBDVjFkT0p0ZVpQbWIzRWJ0L2U3enY1VEcxWG9QcmVjSVkwc3NPNjRRYlAwTjZKbFNCClUvbVJCQ2x3end3ZkpxT0N3YTJVRjRCMklVZGI1UFNheWhpekpSbFNFMFhPaHorUkFvSUJBUURTczU1SS8vV1cKdlAzWUVOU1NORFoyMndZZEtrbGxYMkNSaXUxWEtjNjBLdEZOQTdlVGFZNEpEVUd0SUJXaWlqZU8vd011YTV3MwpoSWJVRmxuVlJLWnEybnlPVzJSRUcxaHg3aUJaNGRuQzBvNlBiMVUwd2EzaTJlb0FYb3JWSFlHR1lBZmJPQi93CjNoZWk0SThuSWZVS09oNUNaNm15R1A5ZlBYbVdxenNVODNjSUtxMnd5ZGxVQUVDcGdLTEYybHduV1FoQnBMWVgKUFVhYmpUczBIQ0wraitMQm5ZZXF0aEp5MENxUmtjaDk4MG8wZjJjd0t6NDBEVU9WSHRLWk9zbnRpOXZ6RlZuagoyT0g5UHRVL3NJVUtRRmpLdW1NQzZCSFZwNC84ZHNuUHM2cEJQdGhRbW95QlM5TkZzdkp6SkxkMGsrT0RyeGhLCkZqVXZmTFNIcFVqbEFvSUJBQU02ZDN0eUlJeDZWV2E1cmcrb3cwblIzVVZhUFhhckF3VkwrTEIzSTQxemdWTmsKK25jd3RZVG1OY3A1T0xiQndBaUd5RmdvdER0djFkTzRLWm9yUnVmR1dzTnhWL2pvWkYwTHdhckMrM1V0VXpLbQpUeHlqNzdmUE0wNGNoS3lFSmFMajMxSElHQmU4NG1GbEdKMk5qSk1CQlhVc3Zqb2RUM2J2aVAvR3VvZGJhdE9kClVaRUJxZUJPSkc4U0p0Y1VWdlkwRkxNRGpEU2hPeWs4ZCsvb2VjL2c4czZhQ0NpOC94UCtycExzb2MyMkpJWDMKV1FqOXBsUHNJQnpJdVZDMm92QWt4UDAwczF4Uk5jSDJ2alY5NENNNDEyQ241cEg4NXE2SVVjWEhZWFlUcVlHSwp3KzYxTjYyMWV1dTQrcUFqU25lK2hYNk0zNU9zSVZHWFEvQlV0NUVDZ2dFQkFNS1JtWjVodHdFTzN2NXlkRW5hCnExelFYdkg1eGJNMkF6QURjYTVtN2ZsVC9OazRrSUl4SERkaHBYOWd2SG5QVndUV21ySjRMdGJacThRWUs3YVUKWVhVVTg2Wmw0TTQvemtuUEV0TE5pOUNyclhmbzRHOEtWeSsvK2FXRHFJS3FiNXlOKzFORm5jRkk1ZHpEcjQzOApmcEtHSHNGRmh0L3UwNHU0Y2hwZlh2eTI0dm1JcDhJMGMxdHRyRWlhZ0RWaXNteW5lOGRhZWNnMkRvakFQNmFjClFQaUFHRzZnc05KRXRmNk9HbkU0aFVOQnNnbU9pTlJqYWxxWTBRcllYck9mSlM4V1V2TkRpVEd0YXVyMzVlYWQKZEEyR1pEZzVMQXRZRUhnUzl4UzFBU0dyRUpLVm5SMjV5ZnZ2OEZaUnJEQUYvTjlMWGZLUmMwV2ZBbGdxdVc3MQpnNzBDZ2dFQVRmV3g1MWpsZjhLMFB6WmJnVGVSTDZIUzA5Ynd5bVZHcERrQVo1T3RML2Vxb3BQKzJsdmpja05mCjUwVWx6QXFxSm95Y2RMMUtwMVp5dU1RVllkMkROYnQwZFNjZWtZallzZ3F0bjFyNmtKY2lRMllmNEVWTzZua2YKYkY3RUtNQ0c0cTZZaEM1VW1LVnN1dytqOS9uaVJHUnZ2Z3ZYMFpRakVlRm1uUlh1U2F1WSt5aWR5a3RqSHZYSgp3OUV5dFIyNk9LWkFmVWIvcXBYMHpUS0VPS2ozRnprMlh6bTQ4dWJvYVc5YjFWMDFRWW5vcUpBQm9Ybjd1VlJ0CjNuMEZwTTU2ckNQcmVVNkpaekRpV2FrRVBVZytNNzA4YUFySWlFY1M3QkJwOHBkNU5waTdKM2dFcE1BcEJzTUkKZ2lLaFBvOHZvekFqZC9RY09PeEFBZUk1Y1BmL1FBPT0KLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo=";

// Invalid base64 strings
const INVALID_BASE64 = "not-valid-base64!!!";

// Valid base64 but invalid PEM content
const VALID_BASE64_INVALID_PEM = Buffer.from("This is not a PEM key").toString('base64');

// Test service account JSON
const TEST_SERVICE_ACCOUNT: GoogleServiceAccountCredentials = {
  type: 'service_account',
  project_id: 'test-project',
  private_key_id: 'test-key-id',
  private_key: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
  client_email: 'test@test.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test.iam.gserviceaccount.com',
  universe_domain: 'googleapis.com',
};

// ============================================================================
// Helper Functions
// ============================================================================

function setEnvKeys(publicKey?: string, privateKey?: string) {
  if (publicKey !== undefined) {
    process.env.RSA_PUBLIC_KEY = publicKey;
  } else {
    delete process.env.RSA_PUBLIC_KEY;
  }
  
  if (privateKey !== undefined) {
    process.env.RSA_PRIVATE_KEY = privateKey;
  } else {
    delete process.env.RSA_PRIVATE_KEY;
  }
}

function clearEnvKeys() {
  delete process.env.RSA_PUBLIC_KEY;
  delete process.env.RSA_PRIVATE_KEY;
}

// ============================================================================
// T027: loadKeyFromEnv - Missing Environment Variable
// ============================================================================

describe('loadKeyFromEnv - Missing Environment Variable (T027)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should gracefully degrade when both keys are missing', async () => {
    const keyManager = new EncryptionManager();
    
    await keyManager.initialize(); // Should not throw
    expect(keyManager.isEnabled()).toBe(false);
    
    const state = keyManager.getState();
    expect(state.enabled).toBe(false);
    if (!state.enabled) {
      expect(state.reason).toBe('keys-not-configured');
    }
  });

  it('should gracefully degrade when only public key is set', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, undefined);
    
    const keyManager = new EncryptionManager();
    
    await keyManager.initialize(); // Should not throw
    expect(keyManager.isEnabled()).toBe(false);
  });
});

// ============================================================================
// T028: loadKeyFromEnv - Invalid Base64
// ============================================================================

describe('loadKeyFromEnv - Invalid Base64 (T028)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should throw InvalidKeyFormatError for invalid PEM format', async () => {
    // Valid base64 but invalid PEM content (missing header/footer)
    const invalidPem = Buffer.from('not a valid PEM key').toString('base64');
    setEnvKeys(invalidPem, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    
    await expect(keyManager.initialize()).rejects.toThrow(InvalidKeyFormatError);
    await expect(keyManager.initialize()).rejects.toThrow(/Invalid PEM format/i);
    await expect(keyManager.initialize()).rejects.toThrow(/scripts\/generate-rsa-keys\.sh/);
  });
});

// ============================================================================
// T029-T030: validatePemKey - Valid and Invalid PEM
// ============================================================================

describe('validatePemKey (T029, T030)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('T029: should succeed with valid PEM public key', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    
    await expect(keyManager.initialize()).resolves.not.toThrow();
    expect(keyManager.isEnabled()).toBe(true);
  });

  it('T030: should throw InvalidKeyFormatError with invalid PEM format', async () => {
    setEnvKeys(VALID_BASE64_INVALID_PEM, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    
    await expect(keyManager.initialize()).rejects.toThrow(InvalidKeyFormatError);
    await expect(keyManager.initialize()).rejects.toThrow(/Invalid public key format/i);
  });
});

// ============================================================================
// T031: areKeysConfigured
// ============================================================================

describe('areKeysConfigured (T031)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should return true when both env vars set', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    expect(keyManager.isEnabled()).toBe(true);
  });

  it('should return false (disabled) when both env vars missing', async () => {
    clearEnvKeys();
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    expect(keyManager.isEnabled()).toBe(false);
  });

  it('should return false (disabled) when only public key is set', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, undefined);
    
    const keyManager = new EncryptionManager();
    
    await keyManager.initialize(); // Should not throw
    expect(keyManager.isEnabled()).toBe(false);
  });

  it('should return false (disabled) when only private key is set', async () => {
    setEnvKeys(undefined, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    
    await keyManager.initialize(); // Should not throw
    expect(keyManager.isEnabled()).toBe(false);
  });
});

// ============================================================================
// T032: GoogleKeyManager.initialize() - Enabled State
// ============================================================================

describe('GoogleKeyManager.initialize() - Enabled State (T032)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should set state to enabled when valid keys provided', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    const state = keyManager.getState();
    expect(state.enabled).toBe(true);
    expect(keyManager.isEnabled()).toBe(true);
  });
});

// ============================================================================
// T033: GoogleKeyManager.initialize() - Disabled State
// ============================================================================

describe('GoogleKeyManager.initialize() - Disabled State (T033)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should set state to disabled when keys not configured', async () => {
    clearEnvKeys();
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    const state = keyManager.getState();
    expect(state.enabled).toBe(false);
    if (!state.enabled) {
      expect(state.reason).toBe('keys-not-configured');
    }
  });
});

// ============================================================================
// T034: GoogleKeyManager.encrypt() - Disabled State
// ============================================================================

describe('GoogleKeyManager.encrypt() - Disabled State (T034)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should throw EncryptionNotEnabledError when encryption disabled', async () => {
    clearEnvKeys();
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    await expect(keyManager.encrypt(TEST_SERVICE_ACCOUNT))
      .rejects.toThrow(EncryptionNotEnabledError);
  });
});

// ============================================================================
// T035: GoogleKeyManager.decrypt() - Disabled State
// ============================================================================

describe('GoogleKeyManager.decrypt() - Disabled State (T035)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should throw EncryptionNotEnabledError when decryption disabled', async () => {
    clearEnvKeys();
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    await expect(keyManager.decrypt('RSA-ENCRYPTED:test'))
      .rejects.toThrow(EncryptionNotEnabledError);
  });
});

// ============================================================================
// T036: Integration Test - Full Encryption/Decryption Cycle
// ============================================================================

describe('Full Encryption/Decryption Cycle (T036)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should encrypt and decrypt service account JSON successfully', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    // Encrypt
    const encrypted = await keyManager.encrypt(TEST_SERVICE_ACCOUNT);
    expect(encrypted).toMatch(/^RSA-ENCRYPTED:/);
    
    // Decrypt
    const decrypted = await keyManager.decrypt(encrypted);
    
    // Verify content matches
    expect(decrypted).toEqual(TEST_SERVICE_ACCOUNT);
    expect(decrypted.client_email).toBe(TEST_SERVICE_ACCOUNT.client_email);
  });

  it('should produce identical result after multiple encrypt/decrypt cycles', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    // First cycle
    const encrypted1 = await keyManager.encrypt(TEST_SERVICE_ACCOUNT);
    const decrypted1 = await keyManager.decrypt(encrypted1);
    
    // Second cycle
    const encrypted2 = await keyManager.encrypt(decrypted1);
    const decrypted2 = await keyManager.decrypt(encrypted2);
    
    expect(decrypted1).toEqual(TEST_SERVICE_ACCOUNT);
    expect(decrypted2).toEqual(TEST_SERVICE_ACCOUNT);
  });
});

// ============================================================================
// T037: Backward Compatibility Test
// ============================================================================

describe('Backward Compatibility (T037)', () => {
  beforeEach(() => {
    clearEnvKeys();
  });

  afterEach(() => {
    clearEnvKeys();
  });

  it('should decrypt existing RSA-ENCRYPTED credentials', async () => {
    setEnvKeys(VALID_PUBLIC_KEY_BASE64, VALID_PRIVATE_KEY_BASE64);
    
    const keyManager = new EncryptionManager();
    await keyManager.initialize();
    
    // Create an encrypted credential using current implementation
    const encrypted = await keyManager.encrypt(TEST_SERVICE_ACCOUNT);
    
    // Verify format matches expected pattern
    expect(encrypted).toMatch(/^RSA-ENCRYPTED:/);
    
    // New key manager instance (simulating server restart)
    const keyManager2 = new EncryptionManager();
    await keyManager2.initialize();
    
    // Should decrypt successfully
    const decrypted = await keyManager2.decrypt(encrypted);
    expect(decrypted).toEqual(TEST_SERVICE_ACCOUNT);
  });
});
