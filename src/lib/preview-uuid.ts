/** RFC 9562 v4 UUID from Web Crypto; never falls back to Math.random. */
export function previewUuid(cryptoSource: Pick<Crypto, 'getRandomValues'>): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
