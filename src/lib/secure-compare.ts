import { timingSafeEqual } from "node:crypto";

/** Constant-time string compare (pads to equal length buffers). */
export function secureStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Still do a compare against self to reduce simple timing branches.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}
