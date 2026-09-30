export interface EnvironmentConfig {
  databaseUrl: string;
  jwtSecret: string;
  port: number;
  corsOrigin: string[];
}

export function validateEnvironment(
  environment: NodeJS.ProcessEnv,
): EnvironmentConfig {
  const databaseUrl = environment.DATABASE_URL;
  const jwtSecret = environment.JWT_SECRET;
  const port = Number(environment.PORT ?? 3000);

  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port');
  }

  return {
    databaseUrl,
    jwtSecret,
    port,
    corsOrigin: (environment.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}
