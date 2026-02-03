/**
 * Google Service Account Encryption API
 *
 * Provides API endpoint for encrypting Google service account credentials.
 * Used by the React frontend to encrypt service account JSON.
 */

import type { Request, Response } from 'express';
import { encryptionManager, EncryptionNotEnabledError } from './utils/encryption-manager.js';
import type { GoogleServiceAccountCredentials } from './providers/google/types.js';

/**
 * Handle encryption request (POST /google-service-encrypt)
 */
export async function handleEncryptionRequest(req: Request, res: Response): Promise<void> {
  try {
    // Check if encryption is enabled
    if (!encryptionManager.isEnabled()) {
      res.status(503).json({ 
        error: 'Encryption is not enabled. ' +
               'Configure RSA_PUBLIC_KEY and RSA_PRIVATE_KEY environment variables. ' +
               'Run ./scripts/generate-rsa-keys.sh to generate keys. ' +
               'See docs/google-service-account-encryption.md for setup instructions.'
      });
      return;
    }

    const { serviceAccountJson } = req.body;

    if (!serviceAccountJson) {
      res.status(400).json({ error: 'Missing serviceAccountJson in request body' });
      return;
    }

    // Parse and validate JSON
    let parsed: GoogleServiceAccountCredentials;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      res.status(400).json({ error: 'Invalid JSON format. Please check your service account JSON and try again.' });
      return;
    }

    // Validate it's a service account
    if (parsed.type !== 'service_account') {
      res.status(400).json({ error: 'Invalid service account JSON. Expected "type": "service_account"' });
      return;
    }

    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      res.status(400).json({ 
        error: 'Invalid service account JSON. Missing required fields (client_email, private_key, or project_id)' 
      });
      return;
    }

    // Encrypt
    const encrypted = await encryptionManager.encrypt(parsed);

    // Return JSON response
    res.json({
      encrypted,
      clientEmail: parsed.client_email,
      projectId: parsed.project_id
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Encryption failed' });
  }
}
