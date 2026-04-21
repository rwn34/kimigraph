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
  private buffer = Buffer.alloc(0);
  private handler: ((msg: JsonRpcMessage) => Promise<unknown>) | null = null;

  start(handler: (msg: JsonRpcMessage) => Promise<unknown>): void {
    this.handler = handler;

    process.stdin.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
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
      // Find Content-Length header in buffer
      const headerPattern = Buffer.from('Content-Length: ');
      const headerStart = this.buffer.indexOf(headerPattern);
      if (headerStart === -1) break;

      const lengthEnd = this.buffer.indexOf('\r\n', headerStart);
      if (lengthEnd === -1) break;

      const contentLengthStr = this.buffer.slice(headerStart + headerPattern.length, lengthEnd).toString('utf8');
      const contentLength = parseInt(contentLengthStr, 10);
      if (isNaN(contentLength)) break;

      const headerEnd = lengthEnd + 4; // skip \r\n\r\n
      if (this.buffer.length < headerEnd + contentLength) break;

      const jsonBytes = this.buffer.slice(headerEnd, headerEnd + contentLength);
      this.buffer = this.buffer.slice(headerEnd + contentLength);

      try {
        const jsonStr = jsonBytes.toString('utf8');
        const msg = JSON.parse(jsonStr) as JsonRpcMessage;
        if (this.handler) {
          this.handler(msg).then((result) => {
            if (result !== undefined && msg.id !== undefined) {
              this.send({ jsonrpc: '2.0', id: msg.id, result });
            }
          }).catch((err) => {
            this.sendError(msg.id, ErrorCodes.InternalError, String(err));
          });
        }
      } catch {
        this.sendError(undefined, ErrorCodes.ParseError, 'Parse error');
      }
    }
  }
}
