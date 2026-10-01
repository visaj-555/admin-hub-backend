export interface EnvironmentConfig {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  CORS_ORIGIN: string[];
  NODE_ENV: string;
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): EnvironmentConfig {
  const databaseUrl = asString(environment.DATABASE_URL);
  const jwtSecret = asString(environment.JWT_SECRET);
  const port = Number(environment.PORT ?? 3000);
  const nodeEnv = asString(environment.NODE_ENV) || 'development';

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    PORT: port,
    NODE_ENV: nodeEnv,
    CORS_ORIGIN: (asString(environment.CORS_ORIGIN) ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
