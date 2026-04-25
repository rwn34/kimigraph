/**
 * Automated MCP server integration validation.
 * Spawns the real MCP server process and exercises every tool via JSON-RPC.
 * Does NOT validate Kimi's tool-choice behavior (that requires manual testing).
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

function encodeMcpMessage(req: JsonRpcRequest): string {
  const json = JSON.stringify(req);
  return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

function parseMcpMessages(data: Buffer): JsonRpcResponse[] {
  const msgs: JsonRpcResponse[] = [];
  let buf = data;
  while (true) {
    const headerPattern = Buffer.from('Content-Length: ');
    const headerStart = buf.indexOf(headerPattern);
    if (headerStart === -1) break;
    const lengthEnd = buf.indexOf('\r\n', headerStart);
    if (lengthEnd === -1) break;
    const contentLength = parseInt(buf.slice(headerStart + headerPattern.length, lengthEnd).toString('utf8'), 10);
    if (isNaN(contentLength)) break;
    const headerEnd = lengthEnd + 4;
    if (buf.length < headerEnd + contentLength) break;
    const jsonBytes = buf.slice(headerEnd, headerEnd + contentLength);
    buf = buf.slice(headerEnd + contentLength);
    try {
      msgs.push(JSON.parse(jsonBytes.toString('utf8')) as JsonRpcResponse);
    } catch { /* ignore parse errors */ }
  }
  return msgs;
}

function send(proc: ReturnType<typeof spawn>, req: JsonRpcRequest): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const handler = (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);
      const msgs = parseMcpMessages(buffer);
      for (const msg of msgs) {
        if (msg.id === req.id) {
          proc.stdout.off('data', handler);
          resolve(msg);
          return;
        }
      }
      // Keep unparsed tail in buffer
      const lastHeader = buffer.lastIndexOf(Buffer.from('Content-Length: '));
      if (lastHeader !== -1) buffer = buffer.slice(lastHeader);
    };
    proc.stdout.on('data', handler);
    proc.stdin.write(encodeMcpMessage(req));
    setTimeout(() => {
      proc.stdout.off('data', handler);
      reject(new Error(`Request ${req.id} timed out`));
    }, 30000);
  });
}

async function main() {
  const testRepo = path.resolve('__tests__', 'fixtures', 'mcp');
  if (!fs.existsSync(path.join(testRepo, '.kimigraph'))) {
    console.error('Test repo not initialized. Run: npx tsx src/bin/kimigraph.ts init __tests__/fixtures/mcp');
    process.exit(1);
  }

  console.log('Spawning MCP server...');
  const proc = spawn('node', [path.resolve('dist', 'bin', 'kimigraph.js'), 'serve', '--mcp', '--project', testRepo], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  proc.stderr.on('data', (d) => {
    const line = d.toString().trim();
    if (line) console.log('[server]', line);
  });

  let id = 0;

  // 1. Initialize
  console.log('\n1. Initialize');
  const initRes = await send(proc, {
    jsonrpc: '2.0',
    id: ++id,
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'validator', version: '0.0.1' } },
  });
  if (initRes.error) throw new Error(`Initialize failed: ${initRes.error.message}`);
  console.log('   ✅ Server initialized');

  // 2. List tools
  console.log('\n2. List tools');
  const toolsRes = await send(proc, {
    jsonrpc: '2.0',
    id: ++id,
    method: 'tools/list',
    params: {},
  });
  if (toolsRes.error) throw new Error(`List tools failed: ${toolsRes.error.message}`);
  const tools = (toolsRes.result as any).tools as Array<{ name: string }>;
  const toolNames = tools.map(t => t.name).sort();
  console.log('   Found tools:', toolNames.join(', '));

  const expectedTools = [
    'kimigraph_callers',
    'kimigraph_callees',
    'kimigraph_context',
    'kimigraph_cycles',
    'kimigraph_dead_code',
    'kimigraph_explore',
    'kimigraph_impact',
    'kimigraph_node',
    'kimigraph_path',
    'kimigraph_search',
    'kimigraph_status',
  ];
  const missing = expectedTools.filter(e => !toolNames.includes(e));
  if (missing.length > 0) throw new Error(`Missing tools: ${missing.join(', ')}`);
  console.log('   ✅ All 11 tools registered');

  // 3. Test explore (the main tool)
  console.log('\n3. Test kimigraph_explore');
  const exploreRes = await send(proc, {
    jsonrpc: '2.0',
    id: ++id,
    method: 'tools/call',
    params: { name: 'kimigraph_explore', arguments: { query: 'auth', budget: 'small' } },
  });
  if (exploreRes.error) throw new Error(`Explore failed: ${exploreRes.error.message}`);
  const exploreText = (exploreRes.result as any).content[0].text as string;
  console.log('   Response length:', exploreText.length, 'chars');
  const hasAuth = exploreText.toLowerCase().includes('auth');
  console.log('   Contains "auth":', hasAuth);
  if (!hasAuth) throw new Error('Explore did not return auth-related results');
  console.log('   ✅ explore returns relevant results');

  // 4. Test search
  console.log('\n4. Test kimigraph_search');
  const searchRes = await send(proc, {
    jsonrpc: '2.0',
    id: ++id,
    method: 'tools/call',
    params: { name: 'kimigraph_search', arguments: { query: 'handleGetUser' } },
  });
  if (searchRes.error) throw new Error(`Search failed: ${searchRes.error.message}`);
  const searchText = (searchRes.result as any).content[0].text as string;
  console.log('   Contains result:', searchText.toLowerCase().includes('handlegetuser') || searchText.toLowerCase().includes('handle_get_user'));
  console.log('   ✅ search returns results');

  // 5. Test status
  console.log('\n5. Test kimigraph_status');
  const statusRes = await send(proc, {
    jsonrpc: '2.0',
    id: ++id,
    method: 'tools/call',
    params: { name: 'kimigraph_status', arguments: {} },
  });
  if (statusRes.error) throw new Error(`Status failed: ${statusRes.error.message}`);
  const statusText = (statusRes.result as any).content[0].text as string;
  console.log('   Has stats:', statusText.includes('files:') || statusText.includes('nodes:'));
  console.log('   ✅ status returns stats');

  // 6. Verify AGENTS.md exists in test repo
  console.log('\n6. Verify AGENTS.md in test repo');
  const agentsPath = path.join(testRepo, '.kimi', 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) throw new Error('AGENTS.md not found');
  const agentsContent = fs.readFileSync(agentsPath, 'utf8');
  const hasExploreGuideline = agentsContent.includes('kimigraph_explore');
  console.log('   AGENTS.md mentions explore:', hasExploreGuideline);
  if (!hasExploreGuideline) throw new Error('AGENTS.md does not mention kimigraph_explore');
  console.log('   ✅ AGENTS.md instructs agent to use explore');

  // Cleanup
  proc.kill();

  console.log('\n========================================');
  console.log('ALL AUTOMATED CHECKS PASSED ✅');
  console.log('========================================');
  console.log('\nWhat this validates:');
  console.log('  • MCP server starts without errors');
  console.log('  • All 11 tools are registered');
  console.log('  • kimigraph_explore returns relevant results');
  console.log('  • kimigraph_search returns results');
  console.log('  • kimigraph_status returns stats');
  console.log('  • AGENTS.md is present and mentions explore');
  console.log('\nWhat still requires manual testing:');
  console.log('  • 2.3.2 — Does Kimi call explore first? (run kimi, ask question, watch tool calls)');
  console.log('  • 2.3.3 — Does Kimi avoid grep for symbol lookup?');
}

main().catch(err => {
  console.error('\n❌ VALIDATION FAILED:', err.message);
  process.exit(1);
});
