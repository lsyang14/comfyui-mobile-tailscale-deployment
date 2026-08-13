import test from 'node:test'; import assert from 'node:assert/strict'; import { securityHeaders, publicError, isAllowedOrigin, rateLimit, isSafeImageUrl } from '../src/security.js';
test('security headers include browser isolation defaults',()=>{const h=securityHeaders();assert.equal(h['x-content-type-options'],'nosniff');assert.equal(h['x-frame-options'],'DENY');assert.match(h['content-security-policy'],/default-src 'self'/)});
test('public errors do not expose internal messages',()=>{assert.deepEqual(publicError(new Error('D:\\secret\\config.json')), {error:'服务暂时不可用',code:'INTERNAL_ERROR'});});
test('origin validation accepts only configured app origin',()=>{assert.equal(isAllowedOrigin('https://ai.example.com','https://ai.example.com'),true);assert.equal(isAllowedOrigin('https://evil.example','https://ai.example.com'),false);});
test('rate limit rejects after the configured number of attempts',()=>{const limiter=rateLimit({limit:2,windowMs:60000});assert.equal(limiter('a'),true);assert.equal(limiter('a'),true);assert.equal(limiter('a'),false);});
test('image URL validation blocks local and credential-bearing URLs',()=>{
  assert.equal(isSafeImageUrl('http://127.0.0.1:8188/view'),false);
  assert.equal(isSafeImageUrl('http://169.254.169.254/latest/meta-data'),false);
  assert.equal(isSafeImageUrl('http://user:pass@example.com/image.png'),false);
  assert.equal(isSafeImageUrl('https://86672552.synology.me:5543/upload/a.png'),true);
});
test('image URL validation enforces an explicit host allowlist',()=>{
  assert.equal(isSafeImageUrl('https://cdn.example.com/a.png',['cdn.example.com']),true);
  assert.equal(isSafeImageUrl('https://evil.example.com/a.png',['cdn.example.com']),false);
});
