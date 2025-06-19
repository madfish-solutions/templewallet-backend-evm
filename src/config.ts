const getEnv = (key: string) => process.env[key] ?? '';
function getEnvNat(key: string, fallback: number): number;
function getEnvNat(key: string): number | undefined;
function getEnvNat(key: string, fallback?: number): number | undefined {
  const value = process.env[key];

  if (!value) return fallback;

  const parsed = parseInt(value, 10);

  return !Number.isInteger(parsed) || parsed <= 0 ? fallback : parsed;
}

export const EnvVars = {
  REDIS_URL: getEnv('REDIS_URL'),
  COVALENT_API_KEY: getEnv('COVALENT_API_KEY'),
  ALCHEMY_API_KEY: getEnv('ALCHEMY_API_KEY'),
  ADMIN_USERNAME: getEnv('ADMIN_USERNAME'),
  ADMIN_PASSWORD: getEnv('ADMIN_PASSWORD')
};

export const PORT = getEnvNat('PORT', 3000);
export const COVALENT_RPS = getEnvNat('COVALENT_RPS', 50);
export const COVALENT_CONCURRENCY = getEnvNat('COVALENT_CONCURRENCY', 10);
export const COVALENT_ATTEMPTS = getEnvNat('COVALENT_ATTEMPTS', 5);
export const COVALENT_BACKOFF_DELAY = getEnvNat('COVALENT_BACKOFF_DELAY', 2000);
export const ALCHEMY_CUPS = getEnvNat('ALCHEMY_CUPS', 500);
export const ALCHEMY_CONCURRENCY = getEnvNat('ALCHEMY_CONCURRENCY');
export const ALCHEMY_ATTEMPTS = getEnvNat('ALCHEMY_ATTEMPTS', 5);
export const ALCHEMY_BACKOFF_DELAY = getEnvNat('ALCHEMY_BACKOFF_DELAY', 1000);
export const IS_TESTING = getEnv('NODE_ENV') === 'test';

for (const name in EnvVars) {
  if (EnvVars[name] == null) throw new Error(`process.env.${name} is not set.`);
}
