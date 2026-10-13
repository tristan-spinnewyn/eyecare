'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

/**
 * Nettoie une chaîne de version en supprimant le préfixe 'v' et les espaces.
 */
function cleanVersion(v) {
  if (!v) return '';
  return String(v).trim().replace(/^v/i, '');
}

/**
 * Calcule la version suivante selon semver (patch, minor, major).
 */
function semverBump(versionStr, type = 'patch') {
  const clean = cleanVersion(versionStr) || '0.1.0';
  const parts = clean.split('.').map((p) => {
    const num = parseInt(p, 10);
    return Number.isFinite(num) ? num : 0;
  });

  let [major = 0, minor = 0, patch = 0] = parts;

  switch (type.toLowerCase()) {
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
 * Récupère la dernière release sur GitHub ou via les tags Git.
 */
function getLatestReleaseTag(cwd = process.cwd()) {
  // 1. Essai via GitHub CLI
  try {
    const out = execSync('gh release view --json tagName -q .tagName', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    if (out) return out;
  } catch {
    // gh release view échoue s'il n'y a aucune release sur GitHub
  }

  // 2. Fallback via les tags Git locaux
  try {
    const tag = execSync('git describe --tags --abbrev=0', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1000,
    }).trim();
    if (tag) return tag;
  } catch {
    // Aucun tag Git
  }

  return null;
}

/**
 * Met à jour package.json et package-lock.json de façon cohérente.
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
 * Interface interactive en ligne de commande.
 */
async function runInteractive(rootDir = process.cwd()) {
  const pkgPath = path.join(rootDir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const currentPkgVersion = pkg.version || '0.1.0';

  const latestRelease = getLatestReleaseTag(rootDir);
  const baseVersion = latestRelease ? cleanVersion(latestRelease) : currentPkgVersion;

  const nextPatch = semverBump(baseVersion, 'patch');
  const nextMinor = semverBump(baseVersion, 'minor');
  const nextMajor = semverBump(baseVersion, 'major');

  console.log('\n======================================================');
  console.log('📦  Gestionnaire de Release — Eyecare 20-20-20');
  console.log('======================================================');
  console.log(`📌  Dernière release GitHub     : ${latestRelease ? `\x1b[32m${latestRelease}\x1b[0m` : '\x1b[33m(aucune release trouvée)\x1b[0m'}`);
  console.log(`📄  Version actuelle package.json : \x1b[36m${currentPkgVersion}\x1b[0m`);
  console.log('------------------------------------------------------');

  const arg = process.argv[2];
  let chosenVersion = null;

  if (arg) {
    if (arg === 'patch') chosenVersion = nextPatch;
    else if (arg === 'minor') chosenVersion = nextMinor;
    else if (arg === 'major') chosenVersion = nextMajor;
    else chosenVersion = cleanVersion(arg);
  } else {
    console.log(`  [1] patch  -> \x1b[32m${nextPatch}\x1b[0m (Recommandé)`);
    console.log(`  [2] minor  -> \x1b[34m${nextMinor}\x1b[0m`);
    console.log(`  [3] major  -> \x1b[35m${nextMajor}\x1b[0m`);
    console.log('  [4] Version personnalisée');
    console.log('------------------------------------------------------');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    try {
      const choice = (await question('👉 Votre choix [1-4 ou numéro de version] (défaut: 1) : ')).trim();

      if (!choice || choice === '1' || choice.toLowerCase() === 'patch') {
        chosenVersion = nextPatch;
      } else if (choice === '2' || choice.toLowerCase() === 'minor') {
        chosenVersion = nextMinor;
      } else if (choice === '3' || choice.toLowerCase() === 'major') {
        chosenVersion = nextMajor;
      } else if (choice === '4') {
        const custom = (await question('✏️  Entrez la version souhaitée (ex: 0.2.0) : ')).trim();
        chosenVersion = cleanVersion(custom);
      } else {
        chosenVersion = cleanVersion(choice);
      }

      if (!chosenVersion) {
        console.error('❌ Version invalide.');
        rl.close();
        process.exit(1);
      }

      const confirm = (await question(`\n❓ Confirmer la release v${chosenVersion} (commit + tag + push) ? [O/n] : `)).trim().toLowerCase();
      rl.close();

      if (confirm && confirm !== 'o' && confirm !== 'oui' && confirm !== 'y' && confirm !== 'yes') {
        console.log('🚫 Opération annulée.');
        return;
      }
    } catch (err) {
      rl.close();
      throw err;
    }
  }

  console.log(`\n⚙️  Mise à jour de package.json et package-lock.json vers v${chosenVersion}...`);
  updatePackageFiles(rootDir, chosenVersion);

  const tagName = `v${chosenVersion}`;

  console.log('📝 Création du commit Git...');
  execSync(`git add package.json package-lock.json`, { cwd: rootDir, stdio: 'inherit' });
  execSync(`git commit -m "chore(release): bump version to ${chosenVersion} [skip ci]"`, { cwd: rootDir, stdio: 'inherit' });

  console.log(`🏷️  Création du tag Git ${tagName}...`);
  execSync(`git tag -a "${tagName}" -m "Release ${tagName}"`, { cwd: rootDir, stdio: 'inherit' });

  console.log(`🚀 Poussée du tag ${tagName} vers GitHub...`);
  execSync(`git push origin "${tagName}"`, { cwd: rootDir, stdio: 'inherit' });

  console.log('🚀 Poussée du commit vers la branche distante...');
  try {
    execSync(`git push origin main`, { cwd: rootDir, stdio: 'inherit' });
    console.log('✅ Branche main synchronisée.');
  } catch (err) {
    console.log('ℹ️  Note : La branche main est protégée contre les pushs directs sans PR.');
    console.log(`🏷️  Le tag ${tagName} a bien été poussé : le workflow GitHub Actions Release compile et publie automatiquement la release !`);
    console.log(`💡 Pour synchroniser la version dans main, une branche PR peut être créée.`);
  }

  console.log('\n======================================================');
  console.log(`🎉 Release ${tagName} lancée avec succès !`);
  console.log(`🔗 Le pipeline de build multiplateforme (Windows & Linux) tourne sur GitHub Actions.`);
  console.log('======================================================\n');
}

if (require.main === module) {
  runInteractive().catch((err) => {
    console.error('Erreur:', err);
    process.exit(1);
  });
}

module.exports = {
  cleanVersion,
  semverBump,
  getLatestReleaseTag,
  updatePackageFiles,
};
