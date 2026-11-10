// Small helpers shared by the lead endpoint and the leads table.
export const MIN = 60 * 1000;
export const iso = (ms) => new Date(ms).toISOString();

/** Salted SHA-256 of the client IP (first 16 bytes, hex). The raw IP is never stored. */
export async function ipHash(env, ip) {
  if (!ip) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.IP_SALT || 'landing-quiz'}|${ip}`));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
