import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['mcp/server.mjs'],
  cwd: process.cwd(),
  stderr: 'pipe',
});

const client = new Client({ name: 'coffer-smoke', version: '0.0.1' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('TOOLS', tools.map((tool) => tool.name).join(', '));

const whoami = await client.callTool({ name: 'whoami', arguments: {} });
console.log('WHOAMI', JSON.stringify(whoami).slice(0, 400));

await client.close();
