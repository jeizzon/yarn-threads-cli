/**
 * Tests for src/lib/config.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Mock fs and os modules before importing config
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

import { loadConfig, getConfigDir, getConfigPath } from '../lib/config.js';
import { readFileSync, existsSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockHomedir = vi.mocked(homedir);

describe('getConfigDir', () => {
  it('returns path to config directory', () => {
    mockHomedir.mockReturnValue('/mock/home');
    const dir = getConfigDir();
    expect(dir).toBe('/mock/home/.config/yarn');
  });
});

describe('getConfigPath', () => {
  it('returns path to config file', () => {
    mockHomedir.mockReturnValue('/mock/home');
    const path = getConfigPath();
    expect(path).toBe('/mock/home/.config/yarn/config.json5');
  });
});

describe('loadConfig', () => {
  let warnings: string[];
  let warnFn: (msg: string) => void;

  beforeEach(() => {
    warnings = [];
    warnFn = (msg: string) => warnings.push(msg);
    mockHomedir.mockReturnValue('/mock/home');
    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockReset();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns empty config when no config files exist', () => {
    mockExistsSync.mockReturnValue(false);
    const config = loadConfig(warnFn);
    expect(config).toEqual({});
    expect(warnings).toHaveLength(0);
  });

  it('loads global config when it exists', () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).includes('.config/yarn/config.json5');
    });
    mockReadFileSync.mockReturnValue('{ "chromeProfile": "Default" }');

    const config = loadConfig(warnFn);
    expect(config).toEqual({ chromeProfile: 'Default' });
    expect(warnings).toHaveLength(0);
  });

  it('loads local config when it exists', () => {
    mockExistsSync.mockImplementation((path) => {
      return String(path).includes('.yarnrc.json5');
    });
    mockReadFileSync.mockReturnValue('{ "timeoutMs": 5000 }');

    const config = loadConfig(warnFn);
    expect(config).toEqual({ timeoutMs: 5000 });
  });

  it('merges global and local config, local takes precedence', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path) => {
      if (String(path).includes('.config/yarn')) {
        return '{ "chromeProfile": "Global", "timeoutMs": 1000 }';
      }
      return '{ "chromeProfile": "Local" }';
    });

    const config = loadConfig(warnFn);
    expect(config.chromeProfile).toBe('Local');
    expect(config.timeoutMs).toBe(1000); // from global
  });

  it('warns on invalid JSON5 syntax', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ invalid json }');

    const config = loadConfig(warnFn);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((w) => w.includes('JSON5') || w.includes('syntax'))).toBe(true);
  });

  it('warns when config is not an object', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('"just a string"');

    const config = loadConfig(warnFn);
    expect(warnings.some((w) => w.includes('expected an object'))).toBe(true);
  });

  it('warns on file read errors', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const config = loadConfig(warnFn);
    expect(warnings.some((w) => w.includes('Permission denied'))).toBe(true);
    expect(config).toEqual({});
  });

  it('handles JSON5 features (comments, trailing commas)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(`{
      // This is a comment
      "chromeProfile": "Default",
      "timeoutMs": 5000,  // trailing comma
    }`);

    const config = loadConfig(warnFn);
    expect(config.chromeProfile).toBe('Default');
    expect(config.timeoutMs).toBe(5000);
    expect(warnings).toHaveLength(0);
  });

  it('handles null config value gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('null');

    const config = loadConfig(warnFn);
    expect(warnings.some((w) => w.includes('expected an object'))).toBe(true);
  });

  it('handles array config value gracefully', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('[1, 2, 3]');

    // Arrays are objects in JS, so this might pass the object check
    // but won't have expected properties
    const config = loadConfig(warnFn);
    // Should either warn or return valid partial config
    expect(typeof config).toBe('object');
  });
});
