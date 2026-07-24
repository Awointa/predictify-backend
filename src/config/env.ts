import { envSchema } from "./env-schema";
import { formatEnvErrors } from "./env-schema";

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:\n" + formatEnvErrors(parsed.error));
  process.exit(1);
}

export const env = parsed.data;