import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/node/mcp';

async function connectClient() {
  const server = buildServer('0.0.0-test');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

function firstText(res: unknown): string {
  const content = (res as { content: { type: string; text?: string }[] }).content;
  return content[0]?.text ?? '';
}

describe('mcp server', () => {
  it('builds without throwing', () => {
    const server = buildServer('0.0.0-test');
    expect(typeof server.connect).toBe('function');
  });

  it('exposes the pdgkit tools', { timeout: 30000 }, async () => {
    const client = await connectClient();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['pdg_refs', 'pdg_render', 'pdg_validate']);
    await client.close();
  });

  it('validates via pdg_validate', { timeout: 30000 }, async () => {
    const client = await connectClient();
    const res = await client.callTool({
      name: 'pdg_validate',
      arguments: { source: '#! kind: block\n10 = A\n11 = B\n10 : 11' },
    });
    const text = firstText(res);
    expect(text).toContain('"kind": "block"');
    expect(text).toContain('"ok": true');
    await client.close();
  });

  it('renders SVG via pdg_render', { timeout: 30000 }, async () => {
    const client = await connectClient();
    const res = await client.callTool({
      name: 'pdg_render',
      arguments: { source: '10 = A\n11 = B\n10 -> 11', format: 'svg', lang: 'ja' },
    });
    expect(firstText(res)).toContain('<svg');
    await client.close();
  });

  it('writes an editable PPTX file via pdg_render', { timeout: 60000 }, async () => {
    const client = await connectClient();
    const out = join(tmpdir(), `pdgkit-mcp-test-${process.pid}.pptx`);
    try {
      const res = await client.callTool({
        name: 'pdg_render',
        arguments: { source: '10 = A\n11 = B\n10 : 11', format: 'pptx', editable: true, outPath: out },
      });
      expect(firstText(res)).toContain('wrote');
      expect(existsSync(out)).toBe(true);
      const bytes = readFileSync(out);
      expect(bytes[0]).toBe(0x50); // "PK" zip signature
      expect(bytes[1]).toBe(0x4b);
    } finally {
      rmSync(out, { force: true });
      await client.close();
    }
  });
});
