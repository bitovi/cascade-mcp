# MCP Flow Diagram

## Initialization Flow

```mermaid
sequenceDiagram
    participant Client
    participant Express as Express<br/>(server.ts)
    participant MCP_Service as MCP Service<br/>(mcp-service.ts)
    participant Transport as StreamableHTTP<br/>ServerTransport
    participant MCP_Server as MCP Server<br/>(per-session)
    participant Factory as Server Factory<br/>(server-factory.ts)
    participant AuthStore as Auth Context<br/>Store
    participant Providers as Providers<br/>(Tools)

    Note over Client,Providers: Phase 1: Initialize Connection

    Client->>Express: POST /mcp<br/>{method: "initialize"}<br/>Authorization: Bearer JWT
    Express->>MCP_Service: handleMcpPost(req, res)
    
    Note over MCP_Service: Check for session ID<br/>Not found - new session
    
    MCP_Service->>MCP_Service: getAuthInfoFromBearer(req)<br/>Validate JWT & extract tokens
    
    Note over MCP_Service: Has valid token,<br/>creating per-session server
    
    MCP_Service->>Factory: createMcpServer(authContext)
    
    Note over Factory: Examine authContext:<br/>- atlassian? Register Atlassian tools<br/>- figma? Register Figma tools<br/>- google? Register Google tools
    
    Factory->>MCP_Server: new McpServer(info, capabilities)
    Factory->>Providers: registerTools(mcp, authContext)
    Providers-->>Factory: Tools registered
    Factory-->>MCP_Service: Fresh MCP Server instance
    
    Note over MCP_Service: Creating streamable transport
    
    MCP_Service->>Transport: new StreamableHTTPServerTransport({<br/>sessionIdGenerator,<br/>onsessioninitialized<br/>})
    
    MCP_Service->>MCP_Server: mcpServer.connect(transport)
    MCP_Server-->>MCP_Service: Connected
    
    Note over Transport: Transport generates session ID<br/>Calls onsessioninitialized callback
    
    Transport->>MCP_Service: onsessioninitialized(sessionId)
    
    MCP_Service->>MCP_Service: sessions[sessionId] = {<br/>transport, mcpServer<br/>}
    
    MCP_Service->>AuthStore: setAuthContext(sessionId, authInfo)
    AuthStore-->>MCP_Service: Stored
    
    Note over MCP_Service: Setup transport.onclose cleanup
    
    MCP_Service->>Transport: handleRequest(req, res, body)
    Transport->>MCP_Server: Route initialize request
    MCP_Server->>Transport: Initialize response
    Transport->>Express: HTTP Response<br/>Header: mcp-session-id
    Express->>Client: 200 OK<br/>{protocolVersion, serverInfo, capabilities}<br/>Header: mcp-session-id
    
    Note over Client: Client stores session ID<br/>for future requests
```

## Tool Call Flow

```mermaid
sequenceDiagram
    participant Client
    participant Express as Express<br/>(server.ts)
    participant MCP_Service as MCP Service<br/>(mcp-service.ts)
    participant Transport as StreamableHTTP<br/>ServerTransport
    participant MCP_Server as MCP Server<br/>(per-session)
    participant Tool as Tool Handler<br/>(provider tool)
    participant AuthStore as Auth Context<br/>Store
    participant API as Provider API<br/>(Jira/Figma/etc)

    Note over Client,API: Phase 2: Tool Call

    Client->>Express: POST /mcp<br/>{method: "tools/call", name: "get-jira-issue"}<br/>Header: mcp-session-id, Authorization
    Express->>MCP_Service: handleMcpPost(req, res)
    
    Note over MCP_Service: Check for session ID<br/>Found in sessions map
    
    MCP_Service->>MCP_Service: Lookup sessions[sessionId]<br/>Get {transport, mcpServer}
    
    Note over MCP_Service: ♻️ Reusing existing transport
    
    MCP_Service->>Transport: handleRequest(req, res, body)
    Transport->>MCP_Server: Route tools/call request
    MCP_Server->>Tool: Execute tool handler(params, context)
    
    Note over Tool: context contains sessionId
    
    Tool->>AuthStore: getAuthContext(sessionId)
    AuthStore-->>Tool: {atlassian: {access_token, ...}}
    
    Tool->>API: API request with access_token
    API-->>Tool: API response
    
    Tool-->>MCP_Server: Tool result
    MCP_Server-->>Transport: JSON-RPC response
    Transport-->>Express: HTTP response
    Express-->>Client: 200 OK<br/>{result: {...}}
```

## SSE Stream & Notifications

```mermaid
sequenceDiagram
    participant Client
    participant Express as Express<br/>(server.ts)
    participant MCP_Service as MCP Service<br/>(mcp-service.ts)
    participant Transport as StreamableHTTP<br/>ServerTransport
    participant Tool as Tool Handler<br/>(long-running)

    Note over Client,Tool: Phase 3: SSE Stream for Notifications

    Client->>Express: GET /mcp<br/>Header: mcp-session-id, Authorization
    Express->>MCP_Service: handleSessionRequest(req, res)
    
    Note over MCP_Service: Method is GET<br/>Validate authentication
    
    MCP_Service->>MCP_Service: getAuthInfoFromBearer(req)
    
    Note over MCP_Service: Update auth context<br/>(for refreshed tokens)
    
    MCP_Service->>MCP_Service: Lookup sessions[sessionId]<br/>Get transport
    MCP_Service->>Transport: handleRequest(req, res)
    
    Note over Transport: Establish SSE stream<br/>Keep connection open
    
    Transport-->>Client: 200 OK<br/>Content-Type: text/event-stream<br/>(Stream stays open)
    
    Note over Client,Tool: Parallel: Tool sends notifications<br/>during execution (via different request)
    
    Note over Tool: Tool (from POST request)<br/>sends notification
    
    Tool->>Transport: sendNotification({<br/>method: "notifications/message",<br/>params: {...}<br/>})
    
    Transport-->>Client: Notification via SSE stream
    
    Note over Client,Transport: SSE stream stays open<br/>Tool result returns via POST response<br/>(not shown in this diagram)
```

## Session Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant MCP_Service as MCP Service<br/>(mcp-service.ts)
    participant Transport as StreamableHTTP<br/>ServerTransport
    participant AuthStore as Auth Context<br/>Store

    Note over Client,AuthStore: Session Creation (covered in Init flow)

    rect rgb(240, 240, 240)
        Note over Client,AuthStore: Active Session - Multiple Requests
        
        loop Multiple tool calls
            Client->>MCP_Service: POST /mcp (with session-id)
            Note over MCP_Service: Reuse sessions[sessionId]
            MCP_Service->>Transport: handleRequest()
            Transport-->>Client: Response
        end
    end

    rect rgb(255, 240, 240)
        Note over Client,AuthStore: Session Cleanup
        
        alt Client sends DELETE
            Client->>MCP_Service: DELETE /mcp
            MCP_Service->>Transport: handleRequest()
            Transport->>Transport: transport.close()
            Transport->>MCP_Service: onclose callback
        else Client disconnects
            Note over Transport: Connection lost
            Transport->>MCP_Service: onclose callback
        end
        
        Note over MCP_Service: onclose callback executes
        
        MCP_Service->>MCP_Service: delete sessions[sessionId]
        MCP_Service->>AuthStore: clearAuthContext(sessionId)
        
        Note over MCP_Service,AuthStore: Session fully cleaned up
    end
```

## Key Patterns

### 1. One Session = One Context
```
sessions[sessionId] = {
  transport: StreamableHTTPServerTransport,
  mcpServer: McpServer (with dynamic tools)
}

authContextStore[sessionId] = {
  atlassian: { access_token, ... },
  figma: { access_token, ... },
  google: { access_token, ... }
}
```

### 2. Dynamic Tool Registration
- Each session gets a **fresh MCP Server instance**
- Tools registered based on **authenticated providers** in authContext
- User only sees tools for providers they authenticated with

### 3. Transport Reuse
- Session ID in header → **reuse existing transport**
- No session ID + initialize → **create new session**
- Same transport handles multiple requests

### 4. Notification Routing
- Notifications sent via SSE (GET) stream
- Transport manages routing between POST requests and SSE notifications
