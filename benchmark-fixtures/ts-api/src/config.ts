import { readFileSync } from 'fs';
import { join } from 'path';

export interface AppConfig {
  port: number;
  dbUrl: string;
  jwtSecret: string;
  logLevel: string;
}

export function loadConfig(): AppConfig {
  const env = process.env.NODE_ENV || 'development';
  const defaults: AppConfig = {
    port: parseInt(process.env.PORT || '3000', 10),
    dbUrl: process.env.DATABASE_URL || 'sqlite://./data.db',
    jwtSecret: process.env.JWT_SECRET || 'dev-secret',
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  try {
    const configPath = join(process.cwd(), `config.${env}.json`);
    const override = JSON.parse(readFileSync(configPath, 'utf8'));
    return { ...defaults, ...override };
  } catch {
    return defaults;
  }
}
