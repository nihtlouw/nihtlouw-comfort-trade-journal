import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { user, session, account, verification, rateLimit } from "@/db/schema";
import { isGoogleAuthConfigured, isSaasBillingConfigured } from "@/lib/billing";

if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32 || process.env.BETTER_AUTH_SECRET.startsWith("replace-with")) {
  throw new Error("Set BETTER_AUTH_SECRET to a random secret of at least 32 characters before enabling the database app.");
}
if (!process.env.BETTER_AUTH_URL) throw new Error("Set BETTER_AUTH_URL to the public origin before enabling the database app.");
const authOrigin = new URL(process.env.BETTER_AUTH_URL);
if (authOrigin.pathname !== "/" || authOrigin.search || authOrigin.hash || authOrigin.username || authOrigin.password) throw new Error("BETTER_AUTH_URL must be a bare origin without a path or credentials.");
if (authOrigin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(authOrigin.hostname)) throw new Error("BETTER_AUTH_URL must use HTTPS outside localhost.");

const allowOpenSignup = process.env.BLOOM_ALLOW_SIGNUP === "true" || isSaasBillingConfigured();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification, rateLimit } }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: !allowOpenSignup,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  ...(isGoogleAuthConfigured()
    ? {
        socialProviders: {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
          },
        },
      }
    : {}),
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  advanced: { useSecureCookies: new URL(process.env.BETTER_AUTH_URL).protocol === "https:" },
});

export function isAllowedMutation(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(process.env.BETTER_AUTH_URL!).origin;
}
