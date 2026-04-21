import { IncomingMessage, ServerResponse } from 'http';
import { listUsers, createUser, getUser, updateUser, deleteUser } from '../services/users';
import { validateUserInput } from '../utils/validation';

export function userRouter(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `http://localhost`);
  const id = url.pathname.split('/')[2];

  if (req.method === 'GET' && !id) {
    const users = listUsers();
    res.statusCode = 200;
    res.end(JSON.stringify(users));
    return;
  }

  if (req.method === 'POST' && !id) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const data = JSON.parse(body);
      const errors = validateUserInput(data);
      if (errors.length > 0) {
        res.statusCode = 400;
        res.end(JSON.stringify({ errors }));
        return;
      }
      const user = createUser(data);
      res.statusCode = 201;
      res.end(JSON.stringify(user));
    });
    return;
  }

  if (req.method === 'GET' && id) {
    const user = getUser(id);
    if (!user) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify(user));
    return;
  }

  if (req.method === 'PUT' && id) {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const data = JSON.parse(body);
      const user = updateUser(id, data);
      res.statusCode = 200;
      res.end(JSON.stringify(user));
    });
    return;
  }

  if (req.method === 'DELETE' && id) {
    deleteUser(id);
    res.statusCode = 204;
    res.end();
    return;
  }

  res.statusCode = 405;
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}
