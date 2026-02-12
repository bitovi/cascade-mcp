/**
 * Text Encryption E2E Test
 * 
 * Tests the generic text encryption functionality:
 * 1. Encryption status endpoint
 * 2. Public key retrieval
 * 3. Generic text encryption via POST (any UTF-8 text)
 * 4. Service account JSON encryption with metadata extraction
 * 5. Round-trip encryption/decryption
 * 
 * Prerequisites:
 * - RSA_PUBLIC_KEY and RSA_PRIVATE_KEY must be set in .env
 * 
 * Run: npm test test/e2e/encryption.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'crypto';
import { startTestServer, stopTestServer } from '../../specs/shared/helpers/test-server.js';

// Test configuration
const RSA_PUBLIC_KEY = process.env.RSA_PUBLIC_KEY;
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;
let SERVER_URL: string;

// Sample test service account (not real credentials)
const TEST_SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'test-project-123',
  private_key_id: 'test-key-id',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC\n-----END PRIVATE KEY-----\n',
  client_email: 'test@test-project.iam.gserviceaccount.com',
  client_id: '123456789',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com'
};

// Skip tests if RSA keys are not configured
const shouldSkip = !RSA_PUBLIC_KEY || !RSA_PRIVATE_KEY;

if (shouldSkip) {
  console.warn('⚠️  Skipping Encryption tests - missing RSA keys');
  console.warn('  Run: ./scripts/generate-rsa-keys.sh');
  console.warn('  See: docs/encryption-setup.md');
}

describe('Text Encryption', () => {
  beforeAll(async () => {
    if (shouldSkip) {
      return;
    }

    console.log('🚀 Starting test server...');
    
    // Clear mock OAuth flag that jest-setup.js sets by default
    delete process.env.TEST_USE_MOCK_ATLASSIAN;
    
    SERVER_URL = await startTestServer({ 
      testMode: false,
      logLevel: 'error', // Quiet logs
      port: 3000 
    });
    console.log(`✅ Test server running at ${SERVER_URL}`);
  }, 60000);

  afterAll(async () => {
    if (shouldSkip) {
      return;
    }

    await stopTestServer();
    console.log('✅ Test server stopped');
  }, 30000);

  test('GET /api/public-key', async () => {
    if (shouldSkip) return;

    const response = await fetch(`${SERVER_URL}/api/public-key`);
    const data = await response.json();

    expect(response.status).toBe(200);
    // Public key is base64 encoded, decode it first
    const publicKeyPem = Buffer.from(data.publicKey, 'base64').toString('utf8');
    expect(publicKeyPem).toContain('BEGIN PUBLIC KEY');
  });

  it('POST /encrypt with plain text (non-JSON)', async () => {
    if (shouldSkip) return;

    const plainText = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';

    const response = await fetch(`${SERVER_URL}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: plainText }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.encrypted).toMatch(/^RSA-ENCRYPTED:/);
  });

  it('POST /encrypt with JSON without service account fields', async () => {
    if (shouldSkip) return;

    const genericJson = JSON.stringify({
      api_key: 'test-key-123',
      db_password: 'secret-password',
      config: { endpoint: 'https://api.example.com' }
    });

    const response = await fetch(`${SERVER_URL}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: genericJson }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.encrypted).toMatch(/^RSA-ENCRYPTED:/);
  });

  it('POST /encrypt with Google service account JSON', async () => {
    if (shouldSkip) return;

    const response = await fetch(`${SERVER_URL}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.stringify(TEST_SERVICE_ACCOUNT) }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.encrypted).toMatch(/^RSA-ENCRYPTED:/);
  });

  test('POST /encrypt validates 50KB size limit', async () => {
    if (shouldSkip) return;

    // Create data exceeding 50KB (51200 bytes)
    const largeData = 'x'.repeat(51201);

    const response = await fetch(`${SERVER_URL}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: largeData }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('50KB');
  });

  test('Encryption/decryption round-trip', async () => {
    if (shouldSkip) return;

    // Encrypt
    const encryptResponse = await fetch(`${SERVER_URL}/encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: JSON.stringify(TEST_SERVICE_ACCOUNT) }),
    });

    const { encrypted } = await encryptResponse.json();
    expect(encrypted).toMatch(/^RSA-ENCRYPTED:/);

    // Decrypt (handles chunked encryption)
    const encryptedData = encrypted.replace('RSA-ENCRYPTED:', '');
    const privateKeyPem = Buffer.from(RSA_PRIVATE_KEY!, 'base64').toString('utf8');
    
    const allChunks = Buffer.from(encryptedData, 'base64');
    
    // RSA-4096 produces 512-byte encrypted chunks
    const ENCRYPTED_CHUNK_SIZE = 512;
    const decryptedChunks: Buffer[] = [];

    for (let i = 0; i < allChunks.length; i += ENCRYPTED_CHUNK_SIZE) {
      const encryptedChunk = allChunks.subarray(i, i + ENCRYPTED_CHUNK_SIZE);
      
      const decryptedChunk = crypto.privateDecrypt(
        {
          key: privateKeyPem,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        encryptedChunk
      );
      
      decryptedChunks.push(decryptedChunk);
    }

    const decrypted = Buffer.concat(decryptedChunks);
    const decryptedJson = JSON.parse(decrypted.toString('utf8'));
    expect(decryptedJson.client_email).toBe(TEST_SERVICE_ACCOUNT.client_email);
  });

  test('GOOGLE_SERVICE_ACCOUNT_ENCRYPTED env var (optional)', () => {
    const encrypted = process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED;
    
    if (!encrypted) {
      console.log('ℹ️  GOOGLE_SERVICE_ACCOUNT_ENCRYPTED not set (OK - optional)');
      return;
    }

    expect(encrypted).toMatch(/^RSA-ENCRYPTED:/);
    console.log('✅ GOOGLE_SERVICE_ACCOUNT_ENCRYPTED configured');
  });
});
