// TypeScript ESM loader for ts-node
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";

// Set up error handlers BEFORE loading any modules
// This lets us see the actual errors
process.on('uncaughtException', (error) => {
  console.error('\n💥 Uncaught Exception During Module Loading:');
  console.error('Error:', error);
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n💥 Unhandled Promise Rejection:');
  console.error('Reason:', reason);
  if (reason instanceof Error) {
    console.error('Stack:', reason.stack);
  }
  process.exit(1);
});

// Load environment variables before any TypeScript modules are loaded
config();

// Register ts-node with error handling
try {
  register("ts-node/esm", pathToFileURL("./"));
} catch (error) {
  console.error('\n💥 Failed to register ts-node loader:');
  console.error(error);
  process.exit(1);
}
