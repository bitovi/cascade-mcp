/**
 * Miro OAuth & API Type Definitions
 * 
 * TypeScript interfaces for Miro OAuth 2.0 credentials and REST API v2 responses.
 */

/**
 * OAuth 2.0 credentials for an authenticated Miro user session
 */
export interface MiroOAuthCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
  user_id?: string;
  team_id?: string;
}

/**
 * Board summary from Miro API
 * Source: GET /v2/boards
 */
export interface MiroBoard {
  id: string;
  name: string;
  description: string;
  viewLink: string;
  createdAt: string;
  modifiedAt: string;
  owner?: {
    id: string;
    type: string;
    name: string;
  };
  team?: {
    id: string;
    name: string;
  };
}

/**
 * Paginated boards response
 */
export interface MiroBoardsResponse {
  data: MiroBoard[];
  total: number;
  size: number;
  offset: number;
}

/**
 * Generic board item from Miro API
 * Source: GET /v2/boards/{board_id}/items
 */
export interface MiroItem {
  id: string;
  type: string;
  position?: {
    x: number;
    y: number;
  };
  geometry?: {
    width?: number;
    height?: number;
    rotation?: number;
  };
  data?: Record<string, any>;
  style?: Record<string, any>;
  createdAt?: string;
  modifiedAt?: string;
  createdBy?: {
    id: string;
    type: string;
    name?: string;
  };
  modifiedBy?: {
    id: string;
    type: string;
    name?: string;
  };
  parent?: {
    id: string;
  };
}

/**
 * Paginated items response
 */
export interface MiroItemsResponse {
  data: MiroItem[];
  cursor?: string;
  limit: number;
  size: number;
  total?: number;
}

/**
 * Connector between two items
 * Source: GET /v2/boards/{board_id}/connectors
 */
export interface MiroConnector {
  id: string;
  startItem?: {
    id: string;
  };
  endItem?: {
    id: string;
  };
  captions?: Array<{
    content: string;
  }>;
  style?: {
    strokeColor?: string;
    strokeWidth?: number;
    strokeStyle?: string;
    startStrokeCap?: string;
    endStrokeCap?: string;
  };
  createdAt?: string;
  modifiedAt?: string;
}

/**
 * Paginated connectors response
 */
export interface MiroConnectorsResponse {
  data: MiroConnector[];
  cursor?: string;
  limit: number;
  size: number;
}

/**
 * Tag on a board
 * Source: GET /v2/boards/{board_id}/tags
 */
export interface MiroTag {
  id: string;
  title: string;
  fillColor: string;
}

/**
 * Paginated tags response
 */
export interface MiroTagsResponse {
  data: MiroTag[];
  limit: number;
  size: number;
}
