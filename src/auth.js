import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
export function hashPassword(password) { const salt=randomBytes(16); return `${salt.toString('hex')}:${scryptSync(password,salt,64).toString('hex')}`; }
export function verifyPassword(password, stored) { const [saltHex,hashHex]=stored.split(':'); if(!saltHex||!hashHex)return false; const actual=scryptSync(password,Buffer.from(saltHex,'hex'),64); return timingSafeEqual(actual,Buffer.from(hashHex,'hex')); }
export function sessionToken() { return randomBytes(32).toString('hex'); }
export function cookie(token) { return `session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=604800${process.env.NODE_ENV==='production'?'; Secure':''}`; }
export function getCookie(req,name='session') { const raw=req.headers.cookie||''; return raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1); }
export function roleAllowed(user, requiredRole) { return Boolean(user && (user.role === requiredRole || (requiredRole === 'user' && user.role === 'admin'))); }
