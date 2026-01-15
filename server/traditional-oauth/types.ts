/**
 * Traditional OAuth Type Definitions
 * 
 * Shared types for Server-Side OAuth flows between bridge server and providers.
 * Re-exports types from provider-interface for convenience.
 */

export type {
  AuthUrlParams,
  TokenExchangeParams,
  RefreshTokenParams,
  StandardTokenResponse,
  OAuthProvider,
} from '../providers/provider-interface.js';

export type {
  OAuthUrlBuilderConfig,
} from './url-builder.js';

export type {
  TokenExchangeConfig,
  TokenRefreshConfig,
} from './token-exchange.js';
