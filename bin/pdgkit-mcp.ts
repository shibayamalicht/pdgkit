#!/usr/bin/env node
/**
 * pdgkit MCP server entry point (stdio transport).
 *
 * Run directly (`pdgkit-mcp`) or register with an MCP host, e.g. Claude Code:
 *
 *   {
 *     "mcpServers": {
 *       "pdgkit": { "command": "pdgkit-mcp" }
 *     }
 *   }
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildServer } from '../src/node/mcp';
import { VERSION } from '../src/node/index';

async function main(): Promise<void> {
  const server = buildServer(VERSION);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`pdgkit-mcp: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
