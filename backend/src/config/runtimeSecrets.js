/**
 * Secrets read from AWS Secrets Manager when a Lambda execution environment
 * starts, instead of being written into the function's configuration.
 *
 * Terraform used to copy MONGODB_URI, JWT_SECRET, CLOUDFRONT_PRIVATE_KEY and
 * EMAIL_APP_PASSWORD into the function's environment variables, where anyone
 * with lambda:GetFunctionConfiguration reads them in plain text. The function
 * now gets `<NAME>_SECRET_ARN` instead, and this module puts the value into
 * process.env before anything reads it, so the rest of the code is unchanged.
 *
 * Values are read once per execution environment and kept, as environment
 * variables were. A rotated secret reaches an environment when it starts;
 * updating the function's configuration replaces every environment at once.
 * A variable that is already set wins, so local development and tests keep
 * using .env.
 */

const SECRET_VARIABLES = ['MONGODB_URI', 'JWT_SECRET', 'CLOUDFRONT_PRIVATE_KEY', 'EMAIL_APP_PASSWORD'];

let loading = null;

const createClient = () => {
  // Required lazily: the EC2 and local entry points never load the SDK client.
  const { SecretsManagerClient } = require('@aws-sdk/client-secrets-manager');
  return new SecretsManagerClient({});
};

const fetchSecrets = async (env, client) => {
  const wanted = SECRET_VARIABLES.filter((name) => !env[name] && env[`${name}_SECRET_ARN`]);
  if (wanted.length === 0) return [];

  const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const secretsManager = client || createClient();
  const values = await Promise.all(
    wanted.map(async (name) => {
      const result = await secretsManager.send(new GetSecretValueCommand({ SecretId: env[`${name}_SECRET_ARN`] }));
      if (typeof result.SecretString !== 'string' || result.SecretString === '') {
        throw new Error(`Secret for ${name} has no string value`);
      }
      return [name, result.SecretString];
    })
  );

  // Set them only once all are read, so a failure leaves none half-loaded.
  for (const [name, value] of values) env[name] = value;
  return wanted;
};

/**
 * Load the secrets this environment still lacks. Concurrent callers share one
 * load; a failed load is forgotten so the next invocation tries again.
 *
 * @returns {Promise<string[]>} names of the variables read from Secrets Manager
 */
const loadRuntimeSecrets = ({ env = process.env, client = null } = {}) => {
  if (!loading) {
    loading = fetchSecrets(env, client).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
};

/** Forget a finished load (tests). */
const resetRuntimeSecrets = () => {
  loading = null;
};

module.exports = { loadRuntimeSecrets, resetRuntimeSecrets, SECRET_VARIABLES };
