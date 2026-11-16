'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildUserAgent } = require('../src/user-agent');

function eventFile(payload) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-')), 'event.json');
  fs.writeFileSync(file, typeof payload === 'string' ? payload : JSON.stringify(payload));
  return file;
}

const publicEvent = () => eventFile({ repository: { private: false } });
const options = (overrides) => ({
  version: 'v1',
  sendRepository: true,
  repository: 'acme/module-example',
  eventPath: publicEvent(),
  ...overrides,
});

test('public repository name is sent by default', () => {
  const result = buildUserAgent(options({}));
  assert.equal(result.userAgent, 'github-action-magento-matrix/v1 (+https://github.com/acme/module-example)');
  assert.equal(result.repositorySent, true);
});

test('send-repository false sends the action name and version only', () => {
  assert.equal(buildUserAgent(options({ sendRepository: false })).userAgent, 'github-action-magento-matrix/v1');
});

test('private repository name is never sent', () => {
  const result = buildUserAgent(options({ eventPath: eventFile({ repository: { private: true } }) }));
  assert.equal(result.userAgent, 'github-action-magento-matrix/v1');
  assert.equal(result.reason, 'repository is not public');
});

test('missing, unreadable or incomplete event payload counts as private', () => {
  for (const eventPath of [undefined, '/nonexistent/event.json', eventFile('not json'), eventFile({})]) {
    assert.equal(buildUserAgent(options({ eventPath })).repositorySent, false);
  }
});

test('a malformed repository name is not put into the header', () => {
  const result = buildUserAgent(options({ repository: 'acme/module\r\nX-Injected: 1' }));
  assert.equal(result.userAgent, 'github-action-magento-matrix/v1');
});
