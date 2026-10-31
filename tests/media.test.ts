import test from 'node:test';
import assert from 'node:assert/strict';
import { findMediaSeed, isAllowedLicense, safeUploadUrl } from '../src/lib/server/media';

test('media cache allows only public-domain or explicitly reusable Creative Commons licenses', () => {
  assert.equal(isAllowedLicense('Public domain', ''), true);
  assert.equal(isAllowedLicense('CC0', 'https://creativecommons.org/publicdomain/zero/1.0/'), true);
  assert.equal(isAllowedLicense('CC BY-SA 3.0', 'https://creativecommons.org/licenses/by-sa/3.0/'), true);
  assert.equal(isAllowedLicense('CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'), true);
  assert.equal(isAllowedLicense('CC BY-NC 4.0', 'https://creativecommons.org/licenses/by-nc/4.0/'), false);
  assert.equal(isAllowedLicense('Fair use', ''), false);
  assert.equal(isAllowedLicense('CC BY 4.0', 'https://unrelated.example/license'), false);
});

test('media requests cannot escape the Wikimedia HTTPS image host', () => {
  assert.equal(safeUploadUrl('https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/file.jpg/960px-file.jpg?utm_source=commons'), 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/file.jpg/960px-file.jpg');
  for (const url of ['http://upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org.evil.example/wikipedia/commons/a.jpg', 'https://user:password@upload.wikimedia.org/wikipedia/commons/a.jpg', 'https://upload.wikimedia.org:444/wikipedia/commons/a.jpg', 'https://localhost/image.jpg']) assert.throws(() => safeUploadUrl(url));
});

test('curated media requires both the historic month and matching event', () => {
  assert.equal(findMediaSeed({ month: '1969-07', title: 'Apollo 11 lands on the Moon', summary: '' })?.key, 'apollo-11');
  assert.equal(findMediaSeed({ month: '1853-01', title: 'Opera premieres at Teatro Apollo', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1969-07', title: 'A presidential election', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1969-07', date: '1969-07-21', title: 'The Soviet Luna 15 crashes into the Moon', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1969-07', date: '1969-07-21', title: 'Luna 15 crashes while Apollo 11 astronauts walk on the Moon', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1945-08', date: '1945-08-09', title: '原子弹投向长崎 Nagasaki', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1945-08', date: '1945-08-06', title: 'Hiroshima atomic bombing', summary: '' })?.key, 'hiroshima');
  assert.equal(findMediaSeed({ month: '1903-12', date: '1903-12-17', title: 'A pilot attempts a flight with another aeroplane', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1903-12', date: '1903-12-14', title: 'The Wright brothers attempt a flight', summary: '' }), undefined);
  assert.equal(findMediaSeed({ month: '1903-12', date: '1903-12-17', title: 'The Wright brothers make the first powered flight', summary: '' })?.key, 'wright-first-flight');
});
