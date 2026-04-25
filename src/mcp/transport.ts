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
  private useRawJson = false;

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
    if (this.useRawJson) {
      process.stdout.write(json + '\n');
    } else {
      process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
    }
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
      // Some clients (e.g., Kimi CLI) send raw JSON lines without Content-Length framing.
      // Detect which format is used and parse accordingly.
      const headerPattern = Buffer.from('Content-Length: ');
      const headerStart = this.buffer.indexOf(headerPattern);

      let jsonStr: string | null = null;

      if (headerStart !== -1) {
        // MCP stdio framing: Content-Length: N\r\n\r\n{...}
        const lengthEnd = this.buffer.indexOf('\r\n', headerStart);
        if (lengthEnd === -1) break;

        const contentLengthStr = this.buffer.slice(headerStart + headerPattern.length, lengthEnd).toString('utf8');
        const contentLength = parseInt(contentLengthStr, 10);
        if (isNaN(contentLength)) break;

        const headerEnd = lengthEnd + 4; // skip \r\n\r\n
        if (this.buffer.length < headerEnd + contentLength) break;

        jsonStr = this.buffer.slice(headerEnd, headerEnd + contentLength).toString('utf8');
        this.buffer = this.buffer.slice(headerEnd + contentLength);
      } else if (this.buffer.length > 0) {
        // Raw JSON line(s): look for a complete JSON object
        const text = this.buffer.toString('utf8');
        // Try to find a complete JSON object by matching braces
        let depth = 0;
        let inString = false;
        let escape = false;
        let end = -1;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (escape) {
            escape = false;
            continue;
          }
          if (ch === '\\') {
            escape = true;
            continue;
          }
          if (ch === '"' && !inString) {
            inString = true;
            continue;
          }
          if (ch === '"' && inString) {
            inString = false;
            continue;
          }
          if (inString) continue;
          if (ch === '{') depth++;
          if (ch === '}') {
            depth--;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end === -1) break; // incomplete JSON, wait for more data
        jsonStr = text.slice(0, end);
        this.buffer = Buffer.from(text.slice(end).trimStart(), 'utf8');
      } else {
        break;
      }

      if (jsonStr === null) break;

      // If client sent raw JSON (no Content-Length), respond in same format
      if (headerStart === -1) {
        this.useRawJson = true;
      }

      try {
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
