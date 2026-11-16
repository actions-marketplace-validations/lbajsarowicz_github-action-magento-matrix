'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { buildMatrix } = require('./select');

const FACTS_URL = 'https://magento.watch/api/v1/magento-community/versions/supported';
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ATTEMPTS = 3;
const TIMEOUT_MS = 10000;

function input(name, fallback) {
  const value = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

function setOutput(name, value) {
  const delimiter = `ghadelimiter_${randomUUID()}`;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function actionVersion() {
  return process.env.GITHUB_ACTION_REF || 'dev';
}

async function fetchFacts() {
  let lastError;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(FACTS_URL, {
        headers: { accept: 'application/json', 'user-agent': `github-action-magento-matrix/${actionVersion()}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: 'error',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = await response.text();
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
        throw new Error('response larger than 1 MB');
      }
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }
  throw lastError;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function loadFacts(snapshot) {
  if (snapshot) {
    const file = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd(), snapshot);
    return { facts: readJson(file), source: 'snapshot' };
  }
  try {
    return { facts: await fetchFacts(), source: 'live' };
  } catch (error) {
    console.log(`::warning::magento.watch could not be reached (${error.message}); using the facts bundled with this action.`);
    return { facts: readJson(path.join(__dirname, '..', 'snapshot.json')), source: 'bundled' };
  }
}

function writeSummary(matrix, skipped, source, facts) {
  if (!process.env.GITHUB_STEP_SUMMARY) {
    return;
  }
  const lines = [
    '### Magento version matrix',
    '',
    '| Magento | PHP | End of support |',
    '|---|---|---|',
    ...matrix.include.map((cell) => `| ${cell.magento} | ${cell.php} | ${cell.eol || 'n/a'} |`),
    '',
    `Source: ${source === 'live' ? '[magento.watch](https://magento.watch)' : source}${
      source === 'bundled' && facts._generated ? ` (facts from ${facts._generated})` : ''
    }. ${matrix.include.length} cell(s).`,
  ];
  if (skipped.length > 0) {
    lines.push('', `Left out because no requested PHP version applies: ${skipped.join('; ')}.`);
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

async function main() {
  const maxCells = Number(input('max-cells', '12'));
  if (!Number.isInteger(maxCells) || maxCells < 1 || maxCells > 256) {
    throw new Error('Input "max-cells" must be a whole number between 1 and 256.');
  }
  const { facts, source } = await loadFacts(input('snapshot', ''));
  const { include, skipped } = buildMatrix(facts, {
    versions: input('versions', 'supported-latest'),
    php: input('php', 'boundaries'),
    maxCells,
  });
  const matrix = { include };
  for (const cell of include) {
    console.log(`Magento ${cell.magento} / PHP ${cell.php}`);
  }
  setOutput('matrix', JSON.stringify(matrix));
  setOutput('cells', String(include.length));
  setOutput('source', source);
  writeSummary(matrix, skipped, source, facts);
}

main().catch((error) => {
  console.log(`::error::${error.message}`);
  process.exitCode = 1;
});
