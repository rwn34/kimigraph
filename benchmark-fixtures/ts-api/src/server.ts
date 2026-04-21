import { createServer, IncomingMessage, ServerResponse } from 'http';
import { loadConfig } from './config';
import { authMiddleware } from './routes/auth';
import { userRouter } from './routes/users';
import { Logger } from './utils/logger';

const config = loadConfig();
const logger = new Logger(config.logLevel);

export function startServer(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    logger.info(`${req.method} ${req.url}`);

    authMiddleware(req, res, () => {
      if (req.url?.startsWith('/users')) {
        userRouter(req, res);
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });

  server.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`);
  });
}

if (require.main === module) {
  startServer();
}
