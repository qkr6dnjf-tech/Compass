import { DomainError } from './domain.mjs';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const COOKIE_AGE = 60 * 60 * 24 * 365;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export function checkWriteOrigin(request) {
  if (request.method !== 'POST') return;
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new DomainError('INVALID_ORIGIN', '동일 사이트에서 요청하세요.', 403);
  }
}

// The secret stays in an HttpOnly cookie. Stored records expose only its hash,
// so knowing a record's owner ID does not grant access to that browser's data.
/** @param {Request} request @param {{userId:string, displayName:string} | null} account */
export async function requestIdentity(request, account = null) {
  if (account) return { ...account, isGuest: false, setCookie: null };
  const secure = new URL(request.url).protocol === 'https:';
  const name = secure ? '__Host-bid-compass-browser' : 'bid-compass-browser';
  const entries = (request.headers.get('cookie') || '').split(';').map(part => part.trim());
  const tokens = entries.filter(part => part.startsWith(name + '=')).map(part => part.slice(name.length + 1));
  let token = tokens.length === 1 && TOKEN_PATTERN.test(tokens[0]) ? tokens[0] : null;
  if (!token && request.method === 'POST') {
    throw new DomainError('BROWSER_STORAGE_REQUIRED', '새로고침 후 다시 시도하세요. 기록을 저장하려면 이 사이트의 쿠키를 허용해야 합니다.', 409);
  }
  token ||= hex(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return {
    userId: 'browser:' + hex(new Uint8Array(digest)),
    displayName: '이 브라우저의 기록',
    isGuest: true,
    setCookie: `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_AGE}${secure ? '; Secure' : ''}`,
  };
}
