// SHA-1 and name-based UUIDs (version 5), synchronous. Only used to make stable ids for the
// parts of a 3MF file (the Python writer uses uuid.uuid5), not for anything secret.

function rotl(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

export function sha1(message: Uint8Array): Uint8Array {
  const length = message.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 0x100000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + 4 * i);
    for (let i = 16; i < 80; i++) {
      w[i] = rotl((w[i - 3] as number) ^ (w[i - 8] as number) ^ (w[i - 14] as number) ^ (w[i - 16] as number), 1);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotl(a, 5) + f + e + k + (w[i] as number)) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(4 * i, h >>> 0));
  return out;
}

/** The URL namespace of RFC 4122, like Python's uuid.NAMESPACE_URL. */
export const NAMESPACE_URL = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replaceAll("-", "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

/** Name-based UUID (version 5): the same as Python's uuid.uuid5(namespace, name). */
export function uuid5(namespace: string, name: string): string {
  const nameBytes = new TextEncoder().encode(name);
  const space = hexToBytes(namespace);
  const input = new Uint8Array(space.length + nameBytes.length);
  input.set(space);
  input.set(nameBytes, space.length);
  const bytes = sha1(input).slice(0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
