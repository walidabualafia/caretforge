import pino from 'pino';

let logger: pino.Logger | undefined;

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = pino({
      level: process.env.LOG_LEVEL ?? 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    });
  }
  return logger;
}

export function setLogLevel(level: string): void {
  getLogger().level = level;
}

export function enableTrace(): void {
  setLogLevel('trace');
}
