/**
 * Manual Token Flow Module
 * 
 * Handles the manual token retrieval flow for developers who need to obtain
 * access tokens directly through a web interface. This is separate from the
 * main MCP OAuth flow and provides a user-friendly way to get tokens for
 * testing and development purposes.
 * 
 * Flow:
 * 1. User visits /get-access-token
 * 2. System generates PKCE parameters and stores in session
 * 3. User is redirected to Atlassian for authorization
 * 4. Atlassian redirects back to /callback with auth code
 * 5. System exchanges code for Atlassian tokens
 * 6. System creates JWT wrapper token and displays to user
 */

import crypto from 'crypto';
import { generateCodeVerifier, generateCodeChallenge } from './pkce.js';
import { createAtlassianAuthUrl, getAtlassianConfig, exchangeCodeForAtlassianTokens } from './atlassian-auth-code-flow.js';
import { jwtSign } from './tokens.js';
import { randomUUID } from 'crypto';

/**
 * Renders the initial manual token retrieval page
 * Generates PKCE parameters and shows authorization button
 */
export function renderManualTokenPage(req, res) {
  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();
  
  // Store PKCE parameters in session for manual flow
  req.session.manualFlow = {
    codeVerifier,
    state,
    isManualFlow: true
  };
  
  // Create authorization URL
  const authUrl = createAtlassianAuthUrl({
    codeChallenge,
    codeChallengeMethod: 'S256',
    state,
    responseType: 'code'
  });
  
  // Render HTML page with authorization link
  res.send(generateInitialPageHtml(authUrl));
}

/**
 * Handles the OAuth callback for manual token flow
 * Exchanges authorization code for tokens and displays result
 */
export async function handleManualFlowCallback(req, res, { code, normalizedState }) {
  console.log('Processing manual flow callback');
  
  // State validation for manual flow
  const manualStateMatches = normalizedState === req.session.manualFlow.state;
  
  if (!code || !manualStateMatches) {
    console.error('Manual flow validation failed:', {
      hasCode: !!code,
      stateMatch: manualStateMatches,
      receivedState: normalizedState,
      expectedState: req.session.manualFlow.state,
    });
    
    // Clear session data
    delete req.session.manualFlow;
    return res.status(400).send(generateErrorPageHtml('Invalid state or code for manual flow'));
  }

  // Exchange code for tokens using our stored code verifier
  try {
    const tokenData = await exchangeCodeForAtlassianTokens({ 
      code, 
      codeVerifier: req.session.manualFlow.codeVerifier 
    });

    // Get config for creating JWT
    const ATLASSIAN_CONFIG = getAtlassianConfig();

    // Calculate JWT expiration (1 minute before Atlassian token expires)
    const atlassianExpiresIn = tokenData.expires_in || 3600;
    const jwtExpiresIn = Math.max(60, atlassianExpiresIn - 60);
    const jwtExpirationTime = Math.floor(Date.now() / 1000) + jwtExpiresIn;

    // Create JWT with embedded Atlassian token
    const jwt = await jwtSign({
      sub: 'user-' + randomUUID(),
      iss: process.env.VITE_AUTH_SERVER_URL,
      aud: process.env.VITE_AUTH_SERVER_URL,
      scope: ATLASSIAN_CONFIG.scopes,
      atlassian_access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      exp: jwtExpirationTime
    });

    // Create a refresh token for manual flow
    const refreshToken = await jwtSign({
      type: 'refresh_token',
      sub: 'user-' + randomUUID(),
      iss: process.env.VITE_AUTH_SERVER_URL,
      aud: process.env.VITE_AUTH_SERVER_URL,
      scope: ATLASSIAN_CONFIG.scopes,
      atlassian_refresh_token: tokenData.refresh_token,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    });

    // Clear manual flow session data
    delete req.session.manualFlow;

    // Display success page with both tokens
    return res.send(generateSuccessPageHtml(jwt, refreshToken));
    
  } catch (error) {
    console.error('Manual flow token exchange failed:', error.message);
    
    // Clear manual flow session data
    delete req.session.manualFlow;
    
    return res.status(400).send(generateErrorPageHtml(
      'Failed to exchange authorization code for access token',
      [
        'Expired authorization code',
        'Invalid authorization parameters', 
        'Network connectivity issues'
      ]
    ));
  }
}

/**
 * Checks if the current session is a manual flow
 */
export function isManualFlow(req) {
  return req.session.manualFlow && req.session.manualFlow.isManualFlow;
}

// === HTML Generation Functions ===

/**
 * Generates the initial page HTML with authorization button
 */
function generateInitialPageHtml(authUrl) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Get Access Token - Jira MCP Auth Bridge</title>
      <style>
        ${getCommonStyles()}
        .step {
          margin: 20px 0;
          padding: 15px;
          background: #f8f9fa;
          border-left: 4px solid #007bff;
          border-radius: 4px;
        }
        .auth-button {
          display: inline-block;
          background: #0052cc;
          color: white;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 4px;
          font-weight: bold;
          margin: 10px 0;
        }
        .auth-button:hover {
          background: #0065ff;
        }
        .warning {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
          color: #856404;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Get Jira Access Token</h1>
        
        <div class="warning">
          <strong>⚠️ Security Notice:</strong> This page is for development and testing purposes. 
          The access token will be displayed in your browser and should be treated as sensitive information.
        </div>
        
        <div class="step">
          <h3>Step 1: Authorize with Atlassian</h3>
          <p>Click the button below to authorize this application with your Atlassian account.</p>
          <a href="${authUrl}" class="auth-button">Authorize with Atlassian</a>
        </div>
        
        <div class="step">
          <h3>Step 2: Get Your Token</h3>
          <p>After authorization, you'll be redirected back here with your access token.</p>
        </div>
        
        <div class="step">
          <h3>What is this for?</h3>
          <p>This access token can be used to authenticate with the Jira MCP service. 
          Copy the token when it appears and use it in your MCP client configuration.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates the success page HTML with the access token and refresh token
 */
function generateSuccessPageHtml(jwt, refreshToken = null) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Access Token Retrieved - Jira MCP Auth Bridge</title>
      <style>
        ${getCommonStyles()}
        .success {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
          color: #155724;
        }
        .token-container {
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
          font-family: monospace;
          word-break: break-all;
        }
        .copy-button {
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          margin-top: 10px;
        }
        .copy-button:hover {
          background: #218838;
        }
        .instructions {
          background: #e9ecef;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎉 Access Token Retrieved Successfully!</h1>
        
        <div class="success">
          <strong>✓ Authorization Complete:</strong> Your access token has been generated and is ready to use.
        </div>
        
        <div class="instructions">
          <h3>How to use this token:</h3>
          <ol>
            <li>Copy the access token below</li>
            <li>Use it in your MCP client configuration</li>
            <li>The token includes embedded Atlassian credentials for Jira access</li>
          </ol>
        </div>
        
        <h3>Your Access Token:</h3>
        <div class="token-container">
          <div id="access-token">${jwt}</div>
          <button class="copy-button" onclick="copyToken('access-token')">Copy Access Token</button>
        </div>
        
        ${refreshToken ? `
        <h3>Your Refresh Token:</h3>
        <div class="token-container">
          <div id="refresh-token">${refreshToken}</div>
          <button class="copy-button" onclick="copyToken('refresh-token')">Copy Refresh Token</button>
        </div>
        ` : ''}
        
        <div class="instructions">
          <h3>Security Notes:</h3>
          <ul>
            <li>Access token expires in ~1 hour</li>
            ${refreshToken ? '<li>Refresh token expires in 30 days</li>' : ''}
            <li>Keep these tokens secure and don't share them</li>
            <li>You can generate new tokens anytime by visiting <a href="/get-access-token">/get-access-token</a></li>
            ${refreshToken ? '<li>Use the refresh token to get new access tokens when they expire</li>' : ''}
          </ul>
        </div>
      </div>
      
      <script>
        function copyToken(elementId) {
          const tokenElement = document.getElementById(elementId);
          const textArea = document.createElement('textarea');
          textArea.value = tokenElement.textContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
          
          const button = tokenElement.nextElementSibling;
          const originalText = button.textContent;
          button.textContent = 'Copied!';
          button.style.background = '#218838';
          setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#28a745';
          }, 2000);
        }
      </script>
    </body>
    </html>
  `;
}

/**
 * Generates the error page HTML
 */
function generateErrorPageHtml(errorMessage, possibleCauses = []) {
  const causesHtml = possibleCauses.length > 0 
    ? `<br><br>This could be due to:<ul>${possibleCauses.map(cause => `<li>${cause}</li>`).join('')}</ul>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Token Retrieval Failed - Jira MCP Auth Bridge</title>
      <style>
        ${getCommonStyles()}
        .error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 4px;
          padding: 15px;
          margin: 20px 0;
          color: #721c24;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>❌ Token Retrieval Failed</h1>
        <div class="error">
          <strong>Error:</strong> ${errorMessage}
          ${causesHtml}
        </div>
        <p><a href="/get-access-token">Try again</a></p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Common CSS styles used across all pages
 */
function getCommonStyles() {
  return `
    body { 
      font-family: Arial, sans-serif; 
      max-width: 800px; 
      margin: 50px auto; 
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { 
      color: #333; 
      text-align: center;
    }
    a {
      color: #007bff;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  `;
}
