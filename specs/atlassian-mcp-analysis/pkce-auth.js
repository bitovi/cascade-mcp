/**
 * PKCE Authentication Module for Atlassian MCP Testing
 * 
 * This module handles OAuth2 PKCE authentication flow for Atlassian's MCP server.
 * Based on: https://raw.githubusercontent.com/bitovi/claude-experiments/refs/heads/main/get-pkce-token.js
 */

import { Issuer, generators } from 'openid-client';
import express from 'express';
import open from 'open';
import fetch from 'node-fetch';
import { URL } from 'url';

// Default configuration
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/callback';
const DEFAULT_SCOPE = 'read:jira-work';

/**
 * Extract port from redirect URI
 */
function getPortFromRedirectUri(redirectUri) {
  try {
    const url = new URL(redirectUri);
    const originalPort = url.port ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80);
    return originalPort;
  } catch (error) {
    console.warn('⚠️  Could not parse redirect URI, using default port 3000:', error.message);
    return 3000;
  }
}

/**
 * Get the OAuth authorization server discovery URL from MCP endpoint
 */
async function getAuthorizationServerDiscoveryUrl(mcpUrl) {
  // First, try to get the metadata URL from WWW-Authenticate header (RFC9728)
  try {
    const res = await fetch(mcpUrl, { method: 'GET' });
    const wwwAuth = res.headers.get('www-authenticate');
    console.log('🔍 WWW-Authenticate header:', wwwAuth);
    
    if (wwwAuth) {
      // Look for resource parameter in WWW-Authenticate header
      const resourceMatch = wwwAuth.match(/resource="([^"]+)"/);
      if (resourceMatch) {
        console.log('✅ Found resource metadata URL in WWW-Authenticate header');
        return resourceMatch[1];
      }
    }
  } catch (error) {
    console.log('⚠️  Could not get resource metadata from WWW-Authenticate header:', error.message);
  }
  
  // Fallback: Try the standard OAuth Authorization Server Metadata endpoint
  const mcpUrlObj = new URL(mcpUrl);
  const authServerMetadataUrl = `${mcpUrlObj.protocol}//${mcpUrlObj.host}/.well-known/oauth-authorization-server`;
  console.log('🔍 Trying standard OAuth Authorization Server Metadata endpoint:', authServerMetadataUrl);
  
  try {
    const res = await fetch(authServerMetadataUrl);
    if (res.ok) {
      console.log('✅ Found OAuth Authorization Server Metadata endpoint');
      return authServerMetadataUrl;
    }
  } catch (error) {
    // Continue to other fallbacks
  }
  
  // Additional fallback: Try OpenID Connect Discovery
  const oidcDiscoveryUrl = `${mcpUrlObj.protocol}//${mcpUrlObj.host}/.well-known/openid-configuration`;
  console.log('🔍 Trying OpenID Connect Discovery endpoint:', oidcDiscoveryUrl);
  
  try {
    const res = await fetch(oidcDiscoveryUrl);
    if (res.ok) {
      console.log('✅ Found OpenID Connect Discovery endpoint');
      return oidcDiscoveryUrl;
    }
  } catch (error) {
    // Continue
  }
  
  throw new Error('Could not find OAuth Authorization Server Metadata or OpenID Connect Discovery endpoint');
}

/**
 * Gets a PKCE access token from an MCP endpoint or OAuth issuer
 * 
 * @param {string|Object} mcpUrlOrConfig - Either MCP URL string or config object with issuer, clientId, etc.
 * @param {Object} options - Additional options (legacy parameter support)
 */
export async function getPkceAccessToken(mcpUrlOrConfig, options = {}) {
  // Support both legacy (mcpUrl, options) and new (config) parameter styles
  let config;
  
  if (typeof mcpUrlOrConfig === 'string') {
    // Legacy style: first parameter is mcpUrl
    config = {
      mcpUrl: mcpUrlOrConfig,
      redirectUri: options.redirectUri || DEFAULT_REDIRECT_URI,
      scope: options.scope || DEFAULT_SCOPE,
      openBrowser: options.openBrowser !== false,
      ...options
    };
  } else {
    // New style: first parameter is config object
    config = {
      redirectUri: DEFAULT_REDIRECT_URI,
      scope: DEFAULT_SCOPE,
      openBrowser: true,
      callbackUrl: DEFAULT_REDIRECT_URI, // Support both naming conventions
      ...mcpUrlOrConfig,
      ...options
    };
    
    // Normalize naming
    if (config.callbackUrl && !config.redirectUri) {
      config.redirectUri = config.callbackUrl;
    }
  }
  
  const {
    mcpUrl,
    issuer: explicitIssuer,
    clientId,
    clientSecret,
    redirectUri,
    scope,
    openBrowser,
    resource
  } = config;
  
  // Determine the port for the callback server
  const port = getPortFromRedirectUri(redirectUri);

  try {
    let issuer;
    
    // Step 1: Get the OAuth issuer
    if (explicitIssuer) {
      // Use explicitly provided issuer
      console.log('🔍 Using explicit issuer:', explicitIssuer);
      issuer = await Issuer.discover(explicitIssuer);
    } else if (mcpUrl) {
      // Discover issuer from MCP URL
      console.log('🔍 Getting OAuth authorization server discovery URL...');
      const discoveryUrl = await getAuthorizationServerDiscoveryUrl(mcpUrl);
      console.log('✅ Discovery URL:', discoveryUrl);
      
      console.log('🔍 Discovering OAuth issuer...');
      issuer = await Issuer.discover(discoveryUrl);
    } else {
      throw new Error('Either mcpUrl or issuer must be provided');
    }
    
    console.log('✅ Discovered issuer:', issuer.issuer);

    // Step 2: Create or register OAuth client
    let client;
    
    if (clientId) {
      // Use provided client credentials
      console.log('🔍 Using provided client credentials...');
      client = new issuer.Client({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uris: [redirectUri],
        response_types: ['code'],
        grant_types: ['authorization_code'],
        token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none'
      });
      console.log('✅ Created client with provided credentials:', clientId);
    } else {
      // Dynamic client registration
      console.log('🔍 Registering OAuth client...');
      client = await issuer.Client.register({
        client_name: 'MCP OAuth Client',
        redirect_uris: [redirectUri],
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // public client
      });
      console.log('✅ Registered client:', client.client_id);
    }

    // Step 3: PKCE generation
    const code_verifier = generators.codeVerifier();
    const code_challenge = generators.codeChallenge(code_verifier);

    // Step 4: Generate authorization URL (optionally with resource parameter per RFC 8707)
    const authParams = {
      scope,
      code_challenge,
      code_challenge_method: 'S256',
      redirect_uri: redirectUri,
    };
    
    // Add resource parameter if provided (RFC 8707 Resource Indicators)
    if (resource) {
      authParams.resource = resource;
      console.log('📋 Including resource parameter:', resource);
    } else {
      console.log('📋 Standard PKCE flow (no resource parameter)');
    }
    
    const authorizationUrl = client.authorizationUrl(authParams);

    console.log('🌐 Authorization URL generated:', authorizationUrl);
    
    if (openBrowser) {
      console.log('🌐 Opening browser...');
      await open(authorizationUrl);
    }

    // Step 5: Handle redirect via local server
    console.log(`🚪 Starting callback server on port ${port}...`);
    
    return new Promise((resolve, reject) => {
      const app = express();

      app.get('/callback', async (req, res) => {
        try {
          const params = client.callbackParams(req);
          
          if (params.error) {
            throw new Error(`Authorization error: ${params.error} - ${params.error_description}`);
          }
          
          if (!params.code) {
            throw new Error('Authorization code not received');
          }
          
          // Manual token exchange for pure OAuth 2.0 (optionally with resource parameter per RFC 8707)
          const tokenParams = {
            grant_type: 'authorization_code',
            code: params.code,
            redirect_uri: redirectUri,
            client_id: client.client_id,
            code_verifier: code_verifier
          };
          
          // Add resource parameter to token request if provided (RFC 8707)
          if (resource) {
            tokenParams.resource = resource;
            console.log('📋 Including resource parameter in token request:', resource);
          } else {
            console.log('📋 Standard token exchange (no resource parameter)');
          }
          
          const tokenResponse = await fetch(issuer.token_endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            body: new URLSearchParams(tokenParams)
          });
          
          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${tokenResponse.status} ${tokenResponse.statusText} - ${errorText}`);
          }
          
          const tokenSet = await tokenResponse.json();
          
          // Add the client_id to the tokenSet for refresh token usage
          tokenSet.client_id = client.client_id;

          console.log('\n🎉 Authentication successful!');
          console.log('✅ Access Token received');
          
          res.send(`
            <html>
              <head><title>Authentication Successful</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: green;">🎉 Authentication Successful!</h1>
                <p>You may close this tab and return to your application.</p>
              </body>
            </html>
          `);

          server.close(() => {
            resolve(tokenSet);
          });
        } catch (err) {
          console.error('❌ Error handling callback:', err);
          res.status(500).send(`
            <html>
              <head><title>Authentication Failed</title></head>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: red;">❌ Authentication Failed</h1>
                <p>Please try again.</p>
                <pre>${err.message}</pre>
              </body>
            </html>
          `);
          server.close(() => {
            reject(err);
          });
        }
      });

      const server = app.listen(port, () => {
        console.log(`🚪 Callback server listening at ${redirectUri}...`);
      });

      server.on('error', (err) => {
        reject(new Error(`Failed to start callback server: ${err.message}`));
      });
    });

  } catch (error) {
    console.error('💥 Error getting PKCE access token:', error);
    throw error;
  }
}

export default getPkceAccessToken;
