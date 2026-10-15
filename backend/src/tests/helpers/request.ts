import request from 'supertest';
import app from '../../app';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface RequestOptions {
  method: HttpMethod;
  path: string;
  token?: string;
  cookie?: string[];
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function makeRequest(options: RequestOptions) {
  const { method, path, token, cookie, body, query } = options;
  
  let req = request(app)[method](path);
  
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  
  if (cookie && cookie.length > 0) {
    req = req.set('Cookie', cookie);
  }
  
  if (query) {
    const queryString = Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    if (queryString) {
      req = req.query(queryString);
    }
  }
  
  if (body && (method === 'post' || method === 'put' || method === 'patch')) {
    req = req.send(body);
  }
  
  return req;
}

export function get(path: string, token?: string, query?: Record<string, string | number | boolean | undefined>) {
  return makeRequest({ method: 'get', path, token, query });
}

export function post(path: string, body?: Record<string, unknown>, token?: string) {
  return makeRequest({ method: 'post', path, body, token });
}

export function put(path: string, body?: Record<string, unknown>, token?: string) {
  return makeRequest({ method: 'put', path, body, token });
}

export function patch(path: string, body?: Record<string, unknown>, token?: string) {
  return makeRequest({ method: 'patch', path, body, token });
}

export function del(path: string, token?: string) {
  return makeRequest({ method: 'delete', path, token });
}
