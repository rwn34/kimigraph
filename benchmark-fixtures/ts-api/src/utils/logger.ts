export class Logger {
  private level: string;

  constructor(level: string = 'info') {
    this.level = level;
  }

  info(message: string): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${new Date().toISOString()} ${message}`);
    }
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${new Date().toISOString()} ${message}`);
    }
  }

  error(message: string): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${new Date().toISOString()} ${message}`);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }
}
