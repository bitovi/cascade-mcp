/**
 * Common test assertion helpers for standards compliance validation
 */

/**
 * Validates RFC 6750 WWW-Authenticate header compliance
 * @param {string} wwwAuthHeader - The WWW-Authenticate header value
 * @throws {Error} If the header is not RFC 6750 compliant
 */
export function validateRfc6750Compliance(wwwAuthHeader) {
  if (!wwwAuthHeader) {
    throw new Error('WWW-Authenticate header is missing');
  }

  // Should start with "Bearer"
  if (!wwwAuthHeader.startsWith('Bearer')) {
    throw new Error('WWW-Authenticate header must start with "Bearer"');
  }

  // Should contain realm parameter
  if (!wwwAuthHeader.includes('realm=')) {
    throw new Error('WWW-Authenticate header must include realm parameter');
  }

  // For OAuth resource servers, should include resource_metadata or resource_metadata_url
  if (!wwwAuthHeader.includes('resource_metadata')) {
    throw new Error('WWW-Authenticate header should include resource_metadata parameter for OAuth discovery');
  }

  // Validate basic structure - should have key=value pairs
  const paramPattern = /\w+="[^"]*"/g;
  const params = wwwAuthHeader.match(paramPattern);
  if (!params || params.length === 0) {
    throw new Error('WWW-Authenticate header must contain properly formatted parameters (key="value")');
  }
}

/**
 * Validates OAuth discovery metadata structure
 * @param {object} metadata - The OAuth metadata object
 * @throws {Error} If the metadata is not compliant
 */
export function validateOAuthMetadata(metadata) {
  const requiredFields = ['issuer', 'authorization_endpoint', 'token_endpoint'];
  
  for (const field of requiredFields) {
    if (!metadata[field]) {
      throw new Error(`OAuth metadata missing required field: ${field}`);
    }
  }

  // Validate URLs are properly formatted
  const urlFields = ['issuer', 'authorization_endpoint', 'token_endpoint', 'registration_endpoint'];
  for (const field of urlFields) {
    if (metadata[field] && !metadata[field].startsWith('http')) {
      throw new Error(`OAuth metadata field ${field} must be a valid HTTP/HTTPS URL`);
    }
  }
}