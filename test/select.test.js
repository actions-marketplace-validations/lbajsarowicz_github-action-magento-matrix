'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatrix } = require('../src/select');

const facts = {
  data: {
    '2.4.8-p4': { systemRequirements: { php: ['8.3', '8.4'] }, eolDate: '2028-05-31' },
    '2.4.7-p9': { systemRequirements: { php: ['8.2', '8.3'] }, eolDate: '2027-05-31' },
    '2.4.7-p10': { systemRequirements: { php: ['8.2', '8.3'] }, eolDate: '2027-05-31' },
    '2.4.8-p5': { systemRequirements: { php: ['8.3', '8.4'] }, eolDate: '2028-05-31' },
    '2.4.8': { systemRequirements: { php: ['8.4', '8.3'] }, eolDate: '2028-05-31' },
    '2.4.9': { systemRequirements: { php: ['8.5'] }, eolDate: '2029-05-31' },
  },
};

const cells = (options) =>
  buildMatrix(facts, { versions: 'supported-latest', php: 'boundaries', maxCells: 12, ...options }).include.map(
    (cell) => `${cell.magento}/${cell.php}`,
  );

test('default picks the newest patch per line with the lowest and highest PHP', () => {
  assert.deepEqual(cells({}), ['2.4.7-p10/8.2', '2.4.7-p10/8.3', '2.4.8-p5/8.3', '2.4.8-p5/8.4', '2.4.9/8.5']);
});

test('patch 10 is newer than patch 9', () => {
  assert.deepEqual(cells({ versions: 'supported-latest', php: 'lowest' })[0], '2.4.7-p10/8.2');
});

test('latest returns one release', () => {
  assert.deepEqual(cells({ versions: 'latest', php: 'all' }), ['2.4.9/8.5']);
});

test('explicit releases keep the requested order', () => {
  assert.deepEqual(cells({ versions: '2.4.9, 2.4.8', php: 'highest' }), ['2.4.9/8.5', '2.4.8/8.4']);
});

test('explicit PHP list filters every release', () => {
  const result = buildMatrix(facts, { versions: 'supported-latest', php: '8.3', maxCells: 12 });
  assert.deepEqual(result.include.map((c) => `${c.magento}/${c.php}`), ['2.4.7-p10/8.3', '2.4.8-p5/8.3']);
  assert.equal(result.skipped.length, 1);
});

test('unknown release is an error', () => {
  assert.throws(() => cells({ versions: '2.4.6' }), /not in the list of supported releases/);
});

test('malformed release input is an error', () => {
  assert.throws(() => cells({ versions: '2.4.8; rm -rf /' }), /is not a Magento release/);
});

test('the cell cap fails the plan instead of truncating it', () => {
  assert.throws(() => cells({ versions: 'supported-all', php: 'all', maxCells: 5 }), /more than max-cells/);
});

test('facts with an unexpected key are rejected', () => {
  assert.throws(
    () => buildMatrix({ data: { '$(id)': { systemRequirements: { php: ['8.3'] } } } }, { versions: 'latest', php: 'all', maxCells: 12 }),
    /unexpected release identifier/,
  );
});

test('facts with a malformed PHP version are rejected', () => {
  assert.throws(
    () => buildMatrix({ data: { '2.4.9': { systemRequirements: { php: ['8.5; id'] } } } }, { versions: 'latest', php: 'all', maxCells: 12 }),
    /no valid PHP list/,
  );
});

test('only whitelisted fields reach the matrix', () => {
  const result = buildMatrix(
    { data: { '2.4.9': { systemRequirements: { php: ['8.5'] }, eolDate: '2029-05-31', image: 'evil/image', run: 'curl x | sh' } } },
    { versions: 'latest', php: 'all', maxCells: 12 },
  );
  assert.deepEqual(Object.keys(result.include[0]).sort(), ['eol', 'line', 'magento', 'mariadb', 'opensearch', 'php']);
});

test('service versions are numbers only, highest first', () => {
  const result = buildMatrix(
    { data: { '2.4.9': { systemRequirements: { php: ['8.5'], mariadb: ['11.8', '12.3', 'evil/image:latest'], opensearch: ['2.19', '3'] } } } },
    { versions: 'latest', php: 'all', maxCells: 12 },
  );
  assert.equal(result.include[0].mariadb, '12.3');
  assert.equal(result.include[0].opensearch, '3');
});
