import request from 'supertest';
import app from '../../app';

const CREDENTIALS = {
  super_admin:     { email: 'admin@gms.local',             password: 'GMSAdmin@2026' },
  admin:           { email: 'office_admin@gms.local',      password: 'GMSAdmin@2026' },
  super_reception: { email: 'super_reception@gms.local',   password: 'GMSAdmin@2026' },
  reception:       { email: 'reception@gms.local',         password: 'GMSAdmin@2026' },
  super_host:      { email: 'super_host@gms.local',        password: 'GMSAdmin@2026' },
  host:            { email: 'host@gms.local',              password: 'GMSAdmin@2026' },
  guest:           { email: 'guest@gms.test',              password: 'GMSGuest@2026' },
  vip_guest:       { email: 'vip@gms.test',                password: 'GMSGuest@2026' },
};

export type RoleType = keyof typeof CREDENTIALS;

export async function loginAs(role: RoleType) {
  const { email, password } = CREDENTIALS[role];
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return {
    token: res.body.data?.accessToken as string,
    cookie: (res.headers['set-cookie'] as unknown) as string[],
    user: res.body.data?.user,
    response: res,
  };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function loginAndGetToken(role: RoleType): Promise<string> {
  const { token } = await loginAs(role);
  return token;
}

export async function loginAndGetCookie(role: RoleType): Promise<string[]> {
  const { cookie } = await loginAs(role);
  return cookie;
}
