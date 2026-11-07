import { cacheDel } from "@/lib/cache";
import { REF_CACHE_TTL_SEC } from "@/lib/constants";

/** Owner-scoped Redis keys for dropdown / reference lists (not balances). */
export const RefCacheKeys = {
  categories: (userId: string) => `ref:cats:${userId}`,
  bankOptions: (userId: string) => `ref:banks:${userId}`,
  cardOptions: (userId: string) => `ref:cards:${userId}`,
} as const;

export { REF_CACHE_TTL_SEC };

export async function invalidateCategoryCache(userId: string): Promise<void> {
  await cacheDel(RefCacheKeys.categories(userId));
}

export async function invalidateBankOptionsCache(userId: string): Promise<void> {
  await cacheDel(RefCacheKeys.bankOptions(userId));
}

export async function invalidateCardOptionsCache(userId: string): Promise<void> {
  await cacheDel(RefCacheKeys.cardOptions(userId));
}
