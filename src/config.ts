/**
 * Configuration management for KimiGraph.
 */

import * as fs from 'fs';
import * as path from 'path';
import { KimiGraphConfig, DEFAULT_CONFIG } from './types';
import { ConfigError } from './errors';

export const KIMIGRAPH_DIR = '.kimigraph';
export const CONFIG_FILE = 'config.json';

export function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, KIMIGRAPH_DIR, CONFIG_FILE);
}

export function loadConfig(projectRoot: string): KimiGraphConfig {
  const configPath = getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<KimiGraphConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    throw new ConfigError(
      `Failed to parse config at ${configPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function saveConfig(
  projectRoot: string,
  config: KimiGraphConfig
): void {
  const configPath = getConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
}

export function createDefaultConfig(projectRoot: string): KimiGraphConfig {
  const config = { ...DEFAULT_CONFIG };
  saveConfig(projectRoot, config);
  return config;
}
