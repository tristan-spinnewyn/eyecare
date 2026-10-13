'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Nettoie une chaîne de version en supprimant le préfixe 'v' et les espaces.
 * @param {string} v
 * @returns {string}
 */
function cleanVersion(v) {
  if (!v) return '';
  return String(v).trim().replace(/^v/i, '');
}

/**
 * Calcule la version suivante selon semver (patch, minor, major).
 * @param {string} versionStr
 * @param {string} type
 * @returns {string}
 */
function semverBump(versionStr, type = 'patch') {
  const clean = cleanVersion(versionStr) || '0.1.0';
  const parts = clean.split('.').map((p) => {
    const num = parseInt(p, 10);
    return Number.isFinite(num) ? num : 0;
  });

  let [major = 0, minor = 0, patch = 0] = parts;

  switch ((type || 'patch').toLowerCase()) {
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'patch':
    default:
      patch += 1;
      break;
  }

  return `${major}.${minor}.${patch}`;
}

/**
 * Récupère la dernière release sur GitHub ou via les tags Git locaux.
 * @param {string} cwd
 * @returns {string|null}
 */
function getLatestReleaseTag(cwd = process.cwd()) {
  try {
    const out = execSync('gh release view --json tagName -q .tagName', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    // Aucune release distante ou gh indisponible
  }

  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (tag) return tag;
  } catch {
    // Aucun tag Git local
  }

  return null;
}

/**
 * Met à jour package.json et package-lock.json avec la version cible.
 * @param {string} rootDir
 * @param {string} targetVersion
 * @returns {{ oldVersion: string, newVersion: string }}
 */
function updatePackageFiles(rootDir, targetVersion) {
  const clean = cleanVersion(targetVersion);
  if (!clean) throw new Error('Version invalide');

  const pkgPath = path.join(rootDir, 'package.json');
  const lockPath = path.join(rootDir, 'package-lock.json');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const oldVersion = pkg.version;
  pkg.version = clean;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(lockPath)) {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    lock.version = clean;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = clean;
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
  }

  return { oldVersion, newVersion: clean };
}

/**
 * Détermine les informations de release en fonction de l'environnement (CI ou local).
 * @param {string} rootDir
 * @param {object} env
 * @returns {{ cleanVersion: string, tagName: string, latestRelease: string, baseVersion: string }}
 */
function determineReleaseInfo(rootDir = process.cwd(), env = process.env) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const currentPkgVersion = pkg.version || '0.1.0';

  const latestRelease = getLatestReleaseTag(rootDir);
  const baseVersion = latestRelease ? cleanVersion(latestRelease) : currentPkgVersion;

  const rawInput = (env.INPUT_TAG || env.INPUT_CUSTOM || env.CUSTOM_VERSION || '').trim();
  const bumpType = (env.INPUT_BUMP || 'patch').trim().toLowerCase();
  const refType = env.REF_TYPE || '';
  const refName = env.REF_NAME || '';

  let clean = '';
  if (rawInput) {
    clean = cleanVersion(rawInput);
  } else if (refType === 'tag' && refName) {
    clean = cleanVersion(refName);
  } else {
    clean = semverBump(baseVersion, bumpType);
  }

  const tagName = 'v' + clean;
  return {
    cleanVersion: clean,
    tagName,
    latestRelease: latestRelease || '',
    baseVersion,
  };
}

/**
 * Point d'entrée CLI pour le helper de release en CI.
 */
function runCli() {
  const command = (process.argv[2] || 'info').toLowerCase();
  const rootDir = process.cwd();
  const info = determineReleaseInfo(rootDir, process.env);

  if (command === 'sync') {
    updatePackageFiles(rootDir, info.cleanVersion);
    console.log(`[release-helper] package.json & package-lock.json synchronisés vers ${info.cleanVersion}`);
  } else if (command === 'info') {
    console.log(`[release-helper] Tag de release déterminé : ${info.tagName} (${info.cleanVersion})`);
    if (info.latestRelease) {
      console.log(`[release-helper] Dernière release détectée : ${info.latestRelease}`);
    } else {
      console.log('[release-helper] Aucune release précédente trouvée (première release)');
    }

    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `tag_name=${info.tagName}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `clean_version=${info.cleanVersion}\n`);
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `latest_release=${info.latestRelease || 'aucune'}\n`);
    }
  } else if (command === 'summary') {
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summary = [
        '### 🚀 Information de Release',
        `- **Dernière release détectée** : ${info.latestRelease ? `\`${info.latestRelease}\`` : '*(première release)*'}`,
        `- **Nouvelle version calculée** : \`${info.cleanVersion}\` (${info.tagName})`,
        `- **Fichiers synchronisés** : \`package.json\`, \`package-lock.json\``,
      ].join('\n');
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
    }
    console.log('[release-helper] Résumé GITHUB_STEP_SUMMARY généré avec succès.');
  } else {
    console.error(`[release-helper] Commande inconnue: ${command}. Utilisez sync, info ou summary.`);
    process.exit(1);
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  cleanVersion,
  semverBump,
  getLatestReleaseTag,
  updatePackageFiles,
  determineReleaseInfo,
  runCli,
};
