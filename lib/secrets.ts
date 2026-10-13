import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const region =
  process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-west-2";

let client: SecretsManagerClient | null = null;
let cachedMistralKey: string | null = null;

/**
 * Resolve the Mistral API key from the environment, falling back to AWS
 * Secrets Manager (via `MISTRAL_SECRET_ARN`). The value is cached per process.
 */
export async function getMistralApiKey(): Promise<string> {
  if (process.env.MISTRAL_API_KEY) {
    return process.env.MISTRAL_API_KEY;
  }

  if (cachedMistralKey) {
    return cachedMistralKey;
  }

  const secretArn = process.env.MISTRAL_SECRET_ARN;
  if (!secretArn) {
    return "";
  }

  if (!client) {
    client = new SecretsManagerClient({ region });
  }

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn })
  );

  const raw = response.SecretString ?? "";
  let key = raw;
  try {
    const parsed = JSON.parse(raw) as { MISTRAL_API_KEY?: string };
    key = parsed.MISTRAL_API_KEY ?? raw;
  } catch {
    // secret stored as a plain string
  }

  cachedMistralKey = key;
  return key;
}
