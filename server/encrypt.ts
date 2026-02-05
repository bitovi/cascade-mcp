/**
 * Generic Text Encryption API
 *
 * Provides API endpoint for encrypting arbitrary text using RSA.
 * Can be used for encrypting service account credentials, tokens, or any sensitive data.
 */

import type { Request, Response } from 'express';
import { encryptionManager } from './utils/encryption-manager.js';

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
               'See docs/encryption-setup.md for setup instructions.'
      });
      return;
    }

    const { text } = req.body;

    if (!text) {
      res.status(400).json({ error: 'Missing text in request body' });
      return;
    }

    if (typeof text !== 'string') {
      res.status(400).json({ error: 'Text must be a string' });
      return;
    }

    // Encrypt the text using the encryption manager
    const encrypted = await encryptionManager.encrypt(text);

    // Return encrypted result
    res.json({ encrypted });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Encryption failed' });
  }
}
