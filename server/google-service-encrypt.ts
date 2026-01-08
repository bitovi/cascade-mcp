/**
 * Google Service Account Encryption Routes
 * 
 * Provides web interface for encrypting Google service account credentials.
 * Users paste their service account JSON and receive an encrypted string
 * that can be safely stored in config files or environment variables.
 */

import type { Request, Response } from 'express';
import { googleKeyManager } from './utils/key-manager.js';
import type { GoogleServiceAccountCredentials } from './providers/google/types.js';

/**
 * Render the encryption page (GET /google-service-encrypt)
 */
export function renderEncryptionPage(req: Request, res: Response): void {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Encrypt Google Service Account - CascadeMCP</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    header {
      background: white;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      border-bottom: 1px solid #e5e7eb;
    }
    
    .header-content {
      max-width: 56rem;
      margin: 0 auto;
      padding: 1rem 1.5rem;
    }
    
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }
    
    .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    main {
      flex: 1;
      padding: 1.5rem;
    }
    
    .container {
      max-width: 56rem;
      margin: 0 auto;
    }
    
    .card {
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1rem;
    }
    
    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      border-left: 4px solid;
    }
    
    .alert-warning {
      background: #fef3c7;
      border-left-color: #f59e0b;
      color: #92400e;
    }
    
    .alert-info {
      background: #dbeafe;
      border-left-color: #3b82f6;
      color: #1e40af;
    }
    
    .alert-title {
      font-weight: 600;
      margin-bottom: 0.25rem;
    }
    
    label {
      display: block;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #374151;
    }
    
    textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      resize: vertical;
      transition: border-color 0.15s, box-shadow 0.15s;
    }
    
    textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.625rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 1rem;
    }
    
    button:hover {
      background: #2563eb;
    }
    
    .link {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s;
    }
    
    .link:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    
    code {
      background: #f3f4f6;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      font-family: 'Courier New', monospace;
      font-size: 0.875em;
      color: #1f2937;
    }
    
    footer {
      background: white;
      border-top: 1px solid #e5e7eb;
      padding: 1.5rem;
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>🔐 Encrypt Google Service Account</h1>
      <p class="subtitle">Secure your service account credentials with RSA-4096 encryption</p>
    </div>
  </header>

  <main>
    <div class="container">
      <div class="card">
        <div class="alert alert-warning">
          <div class="alert-title">⚠️ Security Note</div>
          <p>This page encrypts your credentials using RSA asymmetric encryption. The encrypted output is safe to store in config files, environment variables, or version control.</p>
        </div>
        
        <div class="alert alert-info">
          <p>📝 Paste your Google service account JSON below (typically named <code>google.json</code>). We'll encrypt it and give you a string you can use like a Personal Access Token.</p>
        </div>
        
        <form method="POST" action="/google-service-encrypt">
          <label for="serviceAccountJson">Service Account JSON:</label>
          <textarea 
            id="serviceAccountJson" 
            name="serviceAccountJson" 
            rows="18" 
            placeholder='Paste your service account JSON here...

Example:
{
  "type": "service_account",
  "project_id": "my-project-123",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",
  "client_email": "my-service@my-project.iam.gserviceaccount.com",
  ...
}'
            required
          ></textarea>
          <button type="submit">🔒 Encrypt Credentials</button>
        </form>
      </div>
      
      <div style="text-align: center;">
        <a href="/" class="link">← Back to Home</a>
      </div>
    </div>
  </main>

  <footer>
    <p>CascadeMCP - MCP tools for software teams</p>
  </footer>
</body>
</html>
  `);
}

/**
 * Handle encryption request (POST /google-service-encrypt)
 */
export async function handleEncryptionRequest(req: Request, res: Response): Promise<void> {
  try {
    const { serviceAccountJson } = req.body;

    if (!serviceAccountJson) {
      throw new Error('Missing serviceAccountJson in request body');
    }

    // Parse and validate JSON
    let parsed: GoogleServiceAccountCredentials;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error('Invalid JSON format. Please check your service account JSON and try again.');
    }

    // Validate it's a service account
    if (parsed.type !== 'service_account') {
      throw new Error('Invalid service account JSON. Expected "type": "service_account"');
    }

    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
      throw new Error('Invalid service account JSON. Missing required fields (client_email, private_key, or project_id)');
    }

    // Encrypt
    const encrypted = await googleKeyManager.encrypt(parsed);

    // Return success page
    res.send(renderSuccessPage(encrypted, parsed.client_email, parsed.project_id));
  } catch (error: any) {
    // Return error page
    res.status(400).send(renderErrorPage(error.message));
  }
}

/**
 * Render success page with encrypted result
 */
function renderSuccessPage(encrypted: string, clientEmail: string, projectId: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Encryption Successful - CascadeMCP</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    header {
      background: white;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      border-bottom: 1px solid #e5e7eb;
    }
    
    .header-content {
      max-width: 56rem;
      margin: 0 auto;
      padding: 1rem 1.5rem;
    }
    
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #059669;
      margin-bottom: 0.25rem;
    }
    
    .subtitle {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    main {
      flex: 1;
      padding: 1.5rem;
    }
    
    .container {
      max-width: 56rem;
      margin: 0 auto;
    }
    
    .card {
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .card-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1rem;
    }
    
    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      border-left: 4px solid;
    }
    
    .alert-success {
      background: #d1fae5;
      border-left-color: #10b981;
      color: #065f46;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 0.5rem;
      font-size: 0.875rem;
      margin-bottom: 1rem;
    }
    
    .info-label {
      font-weight: 600;
      color: #374151;
    }
    
    .info-value {
      color: #6b7280;
      font-family: 'Courier New', monospace;
    }
    
    textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      resize: vertical;
      background: #f9fafb;
    }
    
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.625rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
      margin-right: 0.5rem;
      margin-top: 0.5rem;
    }
    
    button:hover {
      background: #2563eb;
    }
    
    button.secondary {
      background: #6b7280;
    }
    
    button.secondary:hover {
      background: #4b5563;
    }
    
    .usage-section {
      background: #f9fafb;
      padding: 1.25rem;
      border-radius: 0.5rem;
      margin-top: 1rem;
    }
    
    .usage-title {
      font-size: 1rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 0.75rem;
    }
    
    .usage-subtitle {
      font-weight: 600;
      color: #374151;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
    }
    
    pre {
      background: #1f2937;
      color: #e5e7eb;
      padding: 1rem;
      border-radius: 0.375rem;
      overflow-x: auto;
      font-size: 0.8125rem;
      line-height: 1.5;
    }
    
    .link {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s;
    }
    
    .link:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    
    footer {
      background: white;
      border-top: 1px solid #e5e7eb;
      padding: 1.5rem;
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>✅ Encryption Successful!</h1>
      <p class="subtitle">Your service account credentials have been encrypted using RSA-4096</p>
    </div>
  </header>

  <main>
    <div class="container">
      <div class="card">
        <div class="alert alert-success">
          <div class="info-grid">
            <span class="info-label">Service Account:</span>
            <span class="info-value">${clientEmail}</span>
            <span class="info-label">Project ID:</span>
            <span class="info-value">${projectId}</span>
            <span class="info-label">Encryption:</span>
            <span class="info-value">RSA-OAEP with SHA-256 (4096-bit key)</span>
          </div>
        </div>
        
        <div class="card-title">📋 Encrypted Credentials</div>
        <p style="color: #6b7280; font-size: 0.875rem; margin-bottom: 0.75rem;">Copy this encrypted string and use it like a Personal Access Token:</p>
        <textarea id="encrypted" readonly rows="4">${encrypted}</textarea>
        <button onclick="copyToClipboard()">📋 Copy to Clipboard</button>
        <button class="secondary" onclick="window.location.href='/google-service-encrypt'">🔒 Encrypt Another</button>
      </div>
      
      <div class="card">
        <div class="usage-section">
          <div class="usage-title">💡 How to Use</div>
          
          <div class="usage-subtitle">Option 1: Pass directly to API client</div>
          <pre><code>import { createGoogleClientWithServiceAccount } from './google-api-client.js';

const encryptedCredentials = "RSA-ENCRYPTED:...";
const client = await createGoogleClientWithServiceAccount(encryptedCredentials);
const response = await client.fetch(
  'https://www.googleapis.com/drive/v3/about?fields=user',
  { method: 'GET' }
);
const userInfo = await response.json();</code></pre>
          
          <div class="usage-subtitle">Option 2: Store in environment variable</div>
          <pre><code># .env file
GOOGLE_SERVICE_ACCOUNT_ENCRYPTED=RSA-ENCRYPTED:...

# In your code
const client = await createGoogleClientWithServiceAccount(
  process.env.GOOGLE_SERVICE_ACCOUNT_ENCRYPTED
);</code></pre>
        </div>
      </div>
      
      <div style="text-align: center;">
        <a href="/" class="link">← Back to Home</a>
      </div>
    </div>
  </main>

  <footer>
    <p>CascadeMCP - MCP tools for software teams</p>
  </footer>
  
  <script>
    function copyToClipboard() {
      const textarea = document.getElementById('encrypted');
      textarea.select();
      textarea.setSelectionRange(0, 99999);
      
      try {
        document.execCommand('copy');
        alert('✅ Copied to clipboard!');
      } catch (err) {
        alert('❌ Failed to copy. Please select and copy manually.');
      }
    }
  </script>
</body>
</html>
  `;
}

/**
 * Render error page
 */
function renderErrorPage(errorMessage: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Encryption Error - CascadeMCP</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: #f3f4f6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    header {
      background: white;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      border-bottom: 1px solid #e5e7eb;
    }
    
    .header-content {
      max-width: 56rem;
      margin: 0 auto;
      padding: 1rem 1.5rem;
    }
    
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #dc2626;
      margin-bottom: 0.25rem;
    }
    
    main {
      flex: 1;
      padding: 1.5rem;
    }
    
    .container {
      max-width: 56rem;
      margin: 0 auto;
    }
    
    .card {
      background: white;
      border-radius: 0.5rem;
      box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }
    
    .alert {
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      border-left: 4px solid;
    }
    
    .alert-error {
      background: #fee2e2;
      border-left-color: #ef4444;
      color: #991b1b;
    }
    
    .error-message {
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      margin: 0;
      word-break: break-word;
    }
    
    button {
      background: #3b82f6;
      color: white;
      border: none;
      padding: 0.625rem 1.25rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 1rem;
    }
    
    button:hover {
      background: #2563eb;
    }
    
    .link {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s;
    }
    
    .link:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    
    footer {
      background: white;
      border-top: 1px solid #e5e7eb;
      padding: 1.5rem;
      text-align: center;
      color: #6b7280;
      font-size: 0.875rem;
    }
  </style>
</head>
<body>
  <header>
    <div class="header-content">
      <h1>❌ Encryption Failed</h1>
    </div>
  </header>

  <main>
    <div class="container">
      <div class="card">
        <div class="alert alert-error">
          <p class="error-message">${errorMessage}</p>
        </div>
        
        <button onclick="window.location.href='/google-service-encrypt'">← Try Again</button>
      </div>
      
      <div style="text-align: center;">
        <a href="/" class="link">← Back to Home</a>
      </div>
    </div>
  </main>

  <footer>
    <p>CascadeMCP - MCP tools for software teams</p>
  </footer>
</body>
</html>
  `;
}
