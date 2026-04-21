/**
 * MCP stdio transport for KimiGraph.
 * Implements JSON-RPC 2.0 over stdio.
 */

export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const ErrorCodes = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
};

export class StdioTransport {
  private buffer = '';
  private handler: ((msg: JsonRpcMessage) => Promise<unknown>) | null = null;

  start(handler: (msg: JsonRpcMessage) => Promise<unknown>): void {
    this.handler = handler;

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.processBuffer();
    });

    process.stdin.on('end', () => {
      this.processBuffer();
    });
  }

  send(msg: JsonRpcMessage): void {
    const json = JSON.stringify(msg);
    process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
  }

  sendError(id: number | string | undefined, code: number, message: string): void {
    this.send({
      jsonrpc: '2.0',
      id: id,
      error: { code, message },
    } as JsonRpcMessage);
  }

  private processBuffer(): void {
    while (true) {
      // Parse Content-Length header
      const headerMatch = this.buffer.match(/Content-Length: (\d+)\r\n\r\n/);
      if (!headerMatch) break;

      const contentLength = parseInt(headerMatch[1], 10);
      const headerEnd = headerMatch.index! + headerMatch[0].length;

      if (this.buffer.length < headerEnd + contentLength) break;

      const jsonStr = this.buffer.slice(headerEnd, headerEnd + contentLength);
      this.buffer = this.buffer.slice(headerEnd + contentLength);

      try {
        const msg = JSON.parse(jsonStr) as JsonRpcMessage;
        if (this.handler) {
          this.handler(msg).catch((err) => {
            this.sendError(msg.id, ErrorCodes.InternalError, String(err));
          });
        }
      } catch {
        this.sendError(undefined, ErrorCodes.ParseError, 'Parse error');
      }
    }
  }
}
