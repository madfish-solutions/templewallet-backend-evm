const getEnv = (key: string) => process.env[key] ?? '';

export const EnvVars = {
  REDIS_URL: getEnv('REDIS_URL'),
  COVALENT_API_KEY: getEnv('COVALENT_API_KEY'),
  ALCHEMY_API_KEY: getEnv('ALCHEMY_API_KEY'),
  ADMIN_USERNAME: getEnv('ADMIN_USERNAME'),
  ADMIN_PASSWORD: getEnv('ADMIN_PASSWORD')
};

for (const name in EnvVars) {
  if (EnvVars[name] == null) throw new Error(`process.env.${name} is not set.`);
}
