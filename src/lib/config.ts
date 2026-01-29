/**
 * Configuration file handling for yarn CLI.
 * Supports JSON5 format for both global and local configs.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import JSON5 from 'json5';
import type { CookieSource } from './cookies.js';

export interface YarnConfig {
  // Browser profiles
  chromeProfile?: string;
  chromeProfileDir?: string;
  firefoxProfile?: string;

  // Cookie extraction
  cookieSource?: CookieSource | CookieSource[];
  cookieTimeoutMs?: number;

  // API defaults
  timeoutMs?: number;
}

const DEFAULT_CONFIG: YarnConfig = {};

function readConfigFile(
  path: string,
  warn: (message: string) => void
): Partial<YarnConfig> {
  if (!existsSync(path)) {
    return {};
  }

  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON5.parse(content);

    if (typeof parsed !== 'object' || parsed === null) {
      warn(`Invalid config file at ${path}: expected an object`);
      return {};
    }

    return parsed as Partial<YarnConfig>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      warn(`Invalid JSON5 syntax in ${path}: ${error.message}`);
    } else if (error instanceof Error) {
      warn(`Error reading config file ${path}: ${error.message}`);
    }
    return {};
  }
}

/**
 * Load configuration from global and local config files.
 * Local config takes precedence over global config.
 */
export function loadConfig(warn: (message: string) => void): YarnConfig {
  const globalPath = join(homedir(), '.config', 'yarn', 'config.json5');
  const localPath = join(process.cwd(), '.yarnrc.json5');

  const globalConfig = readConfigFile(globalPath, warn);
  const localConfig = readConfigFile(localPath, warn);

  return {
    ...DEFAULT_CONFIG,
    ...globalConfig,
    ...localConfig,
  };
}

/**
 * Get the path to the global config directory.
 */
export function getConfigDir(): string {
  return join(homedir(), '.config', 'yarn');
}

/**
 * Get the path to the global config file.
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json5');
}
