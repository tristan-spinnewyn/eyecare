import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { cleanVersion, semverBump, updatePackageFiles } from '../scripts/release.js';

describe('Release script helpers', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eyecare-release-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('cleans version string by removing v and whitespace', () => {
    expect(cleanVersion('v1.2.3')).toBe('1.2.3');
    expect(cleanVersion('  V0.5.1  ')).toBe('0.5.1');
    expect(cleanVersion('2.0.0')).toBe('2.0.0');
    expect(cleanVersion('')).toBe('');
  });

  it('bumps semver versions correctly for patch, minor, and major', () => {
    expect(semverBump('0.1.0', 'patch')).toBe('0.1.1');
    expect(semverBump('0.1.0', 'minor')).toBe('0.2.0');
    expect(semverBump('0.1.0', 'major')).toBe('1.0.0');

    expect(semverBump('v1.4.9', 'patch')).toBe('1.4.10');
    expect(semverBump('v1.4.9', 'minor')).toBe('1.5.0');
    expect(semverBump('v1.4.9', 'major')).toBe('2.0.0');
  });

  it('updates package.json and package-lock.json atomically', () => {
    const pkg = { name: 'test-app', version: '0.1.0' };
    const lock = {
      name: 'test-app',
      version: '0.1.0',
      packages: { '': { version: '0.1.0' } },
    };

    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2));
    fs.writeFileSync(path.join(tmpDir, 'package-lock.json'), JSON.stringify(lock, null, 2));

    const result = updatePackageFiles(tmpDir, '0.2.0');
    expect(result.oldVersion).toBe('0.1.0');
    expect(result.newVersion).toBe('0.2.0');

    const updatedPkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.version).toBe('0.2.0');

    const updatedLock = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package-lock.json'), 'utf-8'));
    expect(updatedLock.version).toBe('0.2.0');
    expect(updatedLock.packages[''].version).toBe('0.2.0');
  });

  it('throws on invalid target version', () => {
    expect(() => updatePackageFiles(tmpDir, '')).toThrow(/Version invalide/);
  });
});
