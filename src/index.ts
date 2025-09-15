#!/usr/bin/env node
import { start } from "./server.js";

// Start the MCP server
start().catch((error) => {
  console.error("Failed to start Jira MCP server:", error);
  process.exit(1);
});
