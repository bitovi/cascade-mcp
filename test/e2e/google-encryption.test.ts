/**
 * Google Service Account Encryption E2E Test
 * 
 * Tests the encryption functionality:
 * 1. Encryption status endpoint
 * 2. Public key retrieval
 * 3. Service account encryption via POST
 * 4. Round-trip encryption/decryption
 * 
 * Prerequisites:
 * - Server must be running: npm run start-local
 * - RSA_PUBLIC_KEY and RSA_PRIVATE_KEY must be set in .env
 * 
 * Run: npm test test/e2e/google-encryption.test.ts
 */

import { describe, test, expect } from '@jest/globals';
import crypto from 'crypto';

// Test configuration
const SERVER_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const RSA_PUBLIC_KEY = process.env.RSA_PUBLIC_KEY;
const RSA_PRIVATE_KEY = process.env.RSA_PRIVATE_KEY;

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
  console.warn('⚠️  Skipping Google Encryption tests - missing RSA keys');
  console.warn('  Run: ./scripts/generate-rsa-keys.sh');
  console.warn('  See: docs/google-service-account-encryption.md');
}

describe('Google Service Account Encryption', () => {
  test('GET /api/public-key', async () => {
    if (shouldSkip) return;

    const response = await fetch(`${SERVER_URL}/api/public-key`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.publicKey).toContain('BEGIN PUBLIC KEY');
  });

  test('POST /google-service-encrypt with valid JSON', async () => {
    if (shouldSkip) return;

    const response = await fetch(`${SERVER_URL}/google-service-encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceAccountJson: JSON.stringify(TEST_SERVICE_ACCOUNT),
      }),
    });

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.encrypted).toMatch(/^RSA-ENCRYPTED:/);
    expect(data.clientEmail).toBe(TEST_SERVICE_ACCOUNT.client_email);
    expect(data.projectId).toBe(TEST_SERVICE_ACCOUNT.project_id);
  });

  test('POST /google-service-encrypt rejects invalid JSON', async () => {
    if (shouldSkip) return;

    const response = await fetch(`${SERVER_URL}/google-service-encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceAccountJson: 'not valid json',
      }),
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  test('Encryption/decryption round-trip', async () => {
    if (shouldSkip) return;

    // Encrypt
    const encryptResponse = await fetch(`${SERVER_URL}/google-service-encrypt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceAccountJson: JSON.stringify(TEST_SERVICE_ACCOUNT),
      }),
    });

    const { encrypted } = await encryptResponse.json();
    expect(encrypted).toMatch(/^RSA-ENCRYPTED:/);

    // Decrypt
    const encryptedData = encrypted.replace('RSA-ENCRYPTED:', '');
    const privateKeyPem = Buffer.from(RSA_PRIVATE_KEY!, 'base64').toString('utf8');
    
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      Buffer.from(encryptedData, 'base64')
    );

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
