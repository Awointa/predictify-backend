import { envSchema, formatEnvErrors } from "./env-schema";

const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Print all validation failures at startup and hard-exit so misconfigured
  // deployments fail fast rather than blowing up at request time.
  console.error("❌  Invalid environment configuration:\n" + formatEnvErrors(result.error));
  process.exit(1);
}

export const env = result.data;
export type Env = typeof env;
