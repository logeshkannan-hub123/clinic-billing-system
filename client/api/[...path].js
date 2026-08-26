// Vercel Serverless Function that reverse-proxies every /api/* request to
// the Render backend, forwarding response headers byte-for-byte — most
// importantly Set-Cookie. Declarative vercel.json rewrites *should* do this
// too, but have proven unreliable for multi-value / Set-Cookie headers in
// practice, so this gives us full explicit control instead.
//
// Because the browser only ever talks to this Vercel domain, the session
// cookie set by Render is stored as a normal first-party, same-site cookie
// — no SameSite=None / third-party-cookie problems.

import dotenv from "dotenv";
dotenv.config();

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN;

export const config = {
  api: {
    bodyParser: false, // pass the raw request body straight through untouched
  },
};

// Headers that must never be copied from the incoming request to the
// upstream fetch (either meaningless cross-hop, or recomputed by fetch
// itself based on the new request).
const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
]);

export default async function handler(req, res) {
  const targetUrl = `${BACKEND_ORIGIN}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let backendResponse;
  try {
    backendResponse = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? "half" : undefined,
      redirect: "manual",
    });
  } catch (error) {
    res
      .status(502)
      .json({ error: "Failed to reach backend", detail: String(error) });
    return;
  }

  res.status(backendResponse.status);

  backendResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "set-cookie" ||
      lower === "content-encoding" ||
      lower === "transfer-encoding"
    )
      return;
    res.setHeader(key, value);
  });

  // Set-Cookie needs special handling: it can legitimately appear multiple
  // times, and Headers.get() would incorrectly comma-join those into one
  // broken header. getSetCookie() (Node 18.14+ / Vercel's runtime) returns
  // each one separately so they can be set back as a real multi-value header.
  const setCookies =
    typeof backendResponse.headers.getSetCookie === "function"
      ? backendResponse.headers.getSetCookie()
      : [];
  if (setCookies.length > 0) {
    res.setHeader("Set-Cookie", setCookies);
  }

  const buffer = Buffer.from(await backendResponse.arrayBuffer());
  res.send(buffer);
}
