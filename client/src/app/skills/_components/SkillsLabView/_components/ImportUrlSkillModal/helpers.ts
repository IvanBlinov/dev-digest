import { ALLOWED_PROTOCOLS, MAX_URL_LENGTH } from "./constants";

/** True for an absolute http(s) URL the server will accept; the server re-validates. */
export function isHttpUrl(value: string): boolean {
  if (!value || value.length > MAX_URL_LENGTH) return false;
  try {
    const { protocol, hostname } = new URL(value);
    return (ALLOWED_PROTOCOLS as readonly string[]).includes(protocol) && hostname.length > 0;
  } catch {
    return false;
  }
}
