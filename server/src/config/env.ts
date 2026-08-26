import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** A purely-numeric value (e.g. "1") is resolved to a JS number so Express
 * applies hop-count semantics (trust exactly N proxies) — Express does NOT
 * do this conversion itself for a string, only for an actual `number`. Any
 * other value (a keyword like "loopback", an IP, or a CIDR list) is passed
 * through as-is for Express's own proxy-address matching. Unset (`null`)
 * means "don't trust any proxy" — Express's own default, left unchanged
 * unless a deployment explicitly opts in. */
function resolveTrustProxy(raw: string | undefined): number | string | null {
  if (!raw || raw.trim() === "") return null;
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? asNumber : raw;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: requireEnv("MONGODB_URI"),
  nodeEnv: process.env.NODE_ENV ?? "development",
  // express-session signs the session cookie with this — rotating it (e.g.
  // after a suspected leak) is safe and recommended, but note it's a single
  // static secret with no rotation/grace-period support: changing it
  // invalidates *every* currently active session at once (every user is
  // signed out on their next request), not just the ones you meant to
  // revoke. That's an expected, one-time side effect of rotating this
  // value, not a bug — plan rotations for a moment that's fine to force a
  // clinic-wide re-login.
  sessionSecret: requireEnv("SESSION_SECRET"),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  // Set only if this deployment actually sits behind a reverse proxy/load
  // balancer — see TRUST_PROXY in .env.example and app.ts. Login rate
  // limiting is IP-keyed (middleware/rateLimit.ts), so an unset value here
  // in front of a real proxy would key every client off the proxy's single
  // address instead of the real client IP.
  trustProxy: resolveTrustProxy(process.env.TRUST_PROXY),
};
