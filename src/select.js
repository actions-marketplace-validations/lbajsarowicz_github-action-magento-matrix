'use strict';

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-p(\d+))?$/;
const PHP = /^\d+\.\d+$/;

function parseVersion(version) {
  const match = VERSION.exec(version);
  if (!match) {
    return null;
  }
  return {
    version,
    line: `${match[1]}.${match[2]}.${match[3]}`,
    parts: [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] ?? 0)],
  };
}

function compareParts(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

function comparePhp(a, b) {
  return compareParts(a.split('.').map(Number), b.split('.').map(Number));
}

/**
 * Only version, PHP list and end-of-life date are taken from the facts. Everything else in the
 * response is ignored, so remote data can never carry commands, images or URLs into a workflow.
 */
function normalizeFacts(raw) {
  const data = raw && typeof raw === 'object' ? raw.data : null;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Facts have no "data" object.');
  }
  const releases = [];
  for (const [key, entry] of Object.entries(data)) {
    const parsed = parseVersion(key);
    if (!parsed) {
      throw new Error(`Facts contain an unexpected release identifier: ${JSON.stringify(key)}`);
    }
    const php = entry?.systemRequirements?.php;
    if (!Array.isArray(php) || php.length === 0 || !php.every((v) => typeof v === 'string' && PHP.test(v))) {
      throw new Error(`Facts for ${key} have no valid PHP list.`);
    }
    const eol = typeof entry.eolDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.eolDate) ? entry.eolDate : '';
    releases.push({ ...parsed, php: [...new Set(php)].sort(comparePhp), eol });
  }
  if (releases.length === 0) {
    throw new Error('Facts list no releases.');
  }
  return releases.sort((a, b) => compareParts(a.parts, b.parts));
}

function selectReleases(releases, versions) {
  const mode = versions.trim();
  if (mode === 'supported-all') {
    return releases;
  }
  if (mode === 'latest') {
    return [releases[releases.length - 1]];
  }
  if (mode === 'supported-latest') {
    const newestPerLine = new Map();
    for (const release of releases) {
      newestPerLine.set(release.line, release);
    }
    return [...newestPerLine.values()];
  }
  const wanted = mode.split(',').map((v) => v.trim()).filter(Boolean);
  if (wanted.length === 0) {
    throw new Error('Input "versions" is empty.');
  }
  return wanted.map((version) => {
    if (!parseVersion(version)) {
      throw new Error(`"${version}" is not a Magento release such as 2.4.8-p5.`);
    }
    const found = releases.find((release) => release.version === version);
    if (!found) {
      throw new Error(`Magento ${version} is not in the list of supported releases.`);
    }
    return found;
  });
}

function selectPhp(release, php) {
  const mode = php.trim();
  const available = release.php;
  if (mode === 'all') {
    return available;
  }
  if (mode === 'lowest') {
    return [available[0]];
  }
  if (mode === 'highest') {
    return [available[available.length - 1]];
  }
  if (mode === 'boundaries') {
    return [...new Set([available[0], available[available.length - 1]])];
  }
  const wanted = mode.split(',').map((v) => v.trim()).filter(Boolean);
  if (wanted.length === 0) {
    throw new Error('Input "php" is empty.');
  }
  for (const version of wanted) {
    if (!PHP.test(version)) {
      throw new Error(`"${version}" is not a PHP minor such as 8.4.`);
    }
  }
  return available.filter((version) => wanted.includes(version));
}

function buildMatrix(raw, { versions, php, maxCells }) {
  const releases = selectReleases(normalizeFacts(raw), versions);
  const include = [];
  const skipped = [];
  for (const release of releases) {
    const phpVersions = selectPhp(release, php);
    if (phpVersions.length === 0) {
      skipped.push(`${release.version} (supports PHP ${release.php.join(', ')})`);
      continue;
    }
    for (const phpVersion of phpVersions) {
      include.push({ magento: release.version, php: phpVersion, line: release.line, eol: release.eol });
    }
  }
  if (include.length === 0) {
    throw new Error('No Magento release matches the requested PHP versions.');
  }
  if (include.length > maxCells) {
    throw new Error(
      `The matrix would hold ${include.length} cells, more than max-cells (${maxCells}). Narrow "versions" or "php", or raise max-cells.`,
    );
  }
  return { include, skipped };
}

module.exports = { buildMatrix, normalizeFacts, parseVersion, selectPhp, selectReleases };
