/**
 * KimiGraph MCP Server
 * Implements the Model Context Protocol over stdio.
 */

import { KimiGraph, findNearestKimiGraphRoot } from '../index';
import { StdioTransport, ErrorCodes, JsonRpcMessage } from './transport';
import { tools, ToolHandler } from './tools';

const SERVER_INFO = { name: 'kimigraph', version: process.env.KIMIGRAPH_VERSION || '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

export class MCPServer {
  private transport = new StdioTransport();
  private kg: KimiGraph | null = null;
  private toolHandler: ToolHandler;
  private projectPath: string | null;

  constructor(projectPath?: string) {
    this.projectPath = projectPath ?? null;
    this.toolHandler = new ToolHandler(null);
  }

  async start(): Promise<void> {
    this.transport.start(this.handleMessage.bind(this));
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());
    process.stdin.on('end', () => this.stop());
  }

  private async tryInit(projectPath: string): Promise<void> {
    const root = findNearestKimiGraphRoot(projectPath);
    if (!root) { this.projectPath = projectPath; return; }
    this.projectPath = root;
    try {
      this.kg = await KimiGraph.open(root);
      this.toolHandler.setDefaultKimiGraph(this.kg);
    } catch (err) {
      process.stderr.write(`[KimiGraph MCP] Failed to open ${root}: ${err}\n`);
    }
  }

  private async handleMessage(msg: JsonRpcMessage): Promise<unknown> {
    const req = msg as any;

    switch (req.method) {
      case 'initialize': {
        const rootUri = req.params?.rootUri ?? req.params?.workspaceFolders?.[0]?.uri;
        if (rootUri) {
          const p = rootUri.startsWith('file://') ? decodeURIComponent(rootUri.replace(/^file:\/\/\/?/, '')) : rootUri;
          await this.tryInit(p);
        } else if (this.projectPath) {
          await this.tryInit(this.projectPath);
        }
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        };
      }

      case 'tools/list':
        return { tools };

      case 'tools/call': {
        const { name, arguments: args = {} } = req.params ?? {};
        try {
          return await this.toolHandler.handle(name, args);
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }
      }

      case 'notifications/initialized':
      case 'ping':
        return {};

      default:
        this.transport.sendError(req.id, ErrorCodes.MethodNotFound, `Unknown method: ${req.method}`);
        return undefined;
    }
  }

  private stop(): void {
    this.kg?.close();
    this.toolHandler.closeAll();
    process.exit(0);
  }
}
