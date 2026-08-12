import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUploadTarget } from '../src/uploader.js';

test('builds PicGo remote path and public URL without exposing credentials', () => {
  const site = { url: 'http://example.test:5543', path: '/uploads/Agent/{year}/{month}/{fullName}', uploadPath: '/TuChuang/wwwroot/blog/uploads/Agent/{year}/{month}/{fullName}' };
  assert.deepEqual(makeUploadTarget(site, 'Krea2_turbo_00001.png', new Date('2026-08-12T00:00:00Z')), {
    remotePath: '/TuChuang/wwwroot/blog/uploads/Agent/2026/08/Krea2_turbo_00001.png',
    publicUrl: 'http://example.test:5543/uploads/Agent/2026/08/Krea2_turbo_00001.png'
  });
});
