# Contributing to Jira MCP Auth Bridge

Thank you for your interest in contributing! This guide will help you set up the project locally and configure it to work with your own Atlassian app credentials.

## Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher recommended)
- An Atlassian developer account ([developer.atlassian.com](https://developer.atlassian.com/))

## 1. Fork and Clone the Repository

```bash
git clone https://github.com/bitovi/jira-mcp-auth-bridge.git
cd jira-mcp-auth-bridge
```

## 2. Install Dependencies

```bash
npm install
```

## 3. Create an Atlassian OAuth App

You must register a new OAuth 2.0 (3LO) app in the Atlassian Developer Console to obtain credentials for local development.

### Steps:
1. Go to the [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2. Click **Create app** > **OAuth 2.0 integration**.
3. Enter an app name (e.g., `Jira MCP Auth Bridge Local`).
4. Set the **Redirect URL** to:
   - `http://localhost:3000/callback`
5. Add the following **OAuth scopes**:
   - `read:jira-work`
   - `write:jira-work`
   - `offline_access`
6. Save the app and copy the **Client ID** and **Client Secret**.

## 4. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in the following variables in your `.env` file using the values from your Atlassian app:
   - `VITE_JIRA_CLIENT_ID` (from Atlassian Developer Console)
   - `JIRA_CLIENT_SECRET` (from Atlassian Developer Console)
   - `VITE_JIRA_CALLBACK_URL` (should be `http://localhost:3000/callback`)
   - `VITE_JIRA_SCOPE` (should be `read:jira-work write:jira-work offline_access`)
   - `SESSION_SECRET` and `JWT_SECRET` (set to random secure strings for local dev)

Example:
```env
VITE_JIRA_CLIENT_ID=your-client-id-here
JIRA_CLIENT_SECRET=your-client-secret-here
VITE_JIRA_APP_KEY=your-app-key-here
VITE_JIRA_CALLBACK_URL=http://localhost:3000/callback
VITE_JIRA_SCOPE="read:jira-work write:jira-work offline_access"
SESSION_SECRET=changeme_in_dev
JWT_SECRET=changeme_in_dev
```

## 5. Run the App Locally

```bash
npm run start-local
```

The server will start on `http://localhost:3000`.

## 6. Testing Token Expiration (Optional)
To test token refresh flows, you can force short-lived tokens:
```bash
TEST_SHORT_AUTH_TOKEN_EXP=60 npm run start-local
```

## 7. Running Integration Tests (Optional)
See the `README.md` and `specs/` directory for integration test instructions.

## 8. Contributing Code
- Please follow the code style and documentation patterns in the repo.
- Update `server/readme.md` with any API or file changes.
- Open a pull request with a clear description of your changes.

---
For more details, see the main `README.md` and `server/readme.md`.
