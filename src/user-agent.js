'use strict';

const fs = require('node:fs');

const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

/**
 * Anything other than an explicit `"private": false` in the event payload counts as private, so a
 * private repository name is never sent, even when the payload is missing or has another shape.
 */
function isPublicRepository(eventPath) {
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8')).repository?.private === false;
  } catch {
    return false;
  }
}

function buildUserAgent({ version, sendRepository, repository, eventPath }) {
  const base = `github-action-magento-matrix/${version || 'dev'}`;
  if (!sendRepository) {
    return { userAgent: base, repositorySent: false, reason: 'send-repository is false' };
  }
  if (!repository || !REPOSITORY.test(repository)) {
    return { userAgent: base, repositorySent: false, reason: 'repository name is not available' };
  }
  if (!isPublicRepository(eventPath)) {
    return { userAgent: base, repositorySent: false, reason: 'repository is not public' };
  }
  return { userAgent: `${base} (+https://github.com/${repository})`, repositorySent: true, reason: '' };
}

module.exports = { buildUserAgent };
