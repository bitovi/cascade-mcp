---
mode: agent
---

We will make the app use ngrok to expose a local server to the internet.

We need to:

1. **Backup the current `.env` file:**
   ```bash
   cp .env .env.backup
   ```

2. **Check if ngrok is installed, and install if needed:**
   ```bash
   if ! command -v ngrok &> /dev/null; then
     echo "ngrok not found. Installing via brew..."
     brew install ngrok
   else
     echo "ngrok is already installed"
   fi
   ```

3. **Start an ngrok tunnel to expose local server port 3000 (in background):**
   ```bash
   ngrok http 3000 --log=stdout > ngrok.log &
   NGROK_PID=$!
   echo "Started ngrok with PID: $NGROK_PID"
   sleep 3
   ```

4. **Get the ngrok public URL:**
   ```bash
   NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"https://[^"]*' | grep -o 'https://[^"]*' | head -n1)
   echo "Ngrok URL: $NGROK_URL"
   ```

5. **Restore `.env` from backup and update with ngrok URL:**
   ```bash
   cp .env.backup .env
   ```
   Then update the following variables in `.env`:
   - Change `VITE_JIRA_CALLBACK_URL=http://localhost:3000/auth/callback/atlassian` to `VITE_JIRA_CALLBACK_URL=${NGROK_URL}/auth/callback/atlassian`
   - Change `VITE_AUTH_SERVER_URL=http://localhost:3000` to `VITE_AUTH_SERVER_URL=${NGROK_URL}`

6. **Restart the local server to apply the changes:**
   ```bash
   # Stop any existing server process on port 3000
   lsof -ti:3000 | xargs kill -9 2>/dev/null || true
   
   # Start the server
   npm run start-local
   ```

7. **Tell the user:**
   > ✅ Ngrok tunnel is running at: `${NGROK_URL}`
   > 
   > **Next steps:**
   > 1. **IMPORTANT:** Visit `${NGROK_URL}` in your browser first to enable the ngrok tunnel (ngrok requires this initial visit)
   > 2. Update your Atlassian OAuth app settings at https://developer.atlassian.com/console/myapps/
   > 3. Change the callback URL to: `${NGROK_URL}/auth/callback/atlassian`
   > 
   > **To stop ngrok:** `kill ${NGROK_PID}`
   > **To view ngrok dashboard:** http://localhost:4040