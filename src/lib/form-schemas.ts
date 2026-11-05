import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";

/** Shared Zod pieces for FormData mutations (M2). */

export const zNonEmpty = z.string().trim().min(1, "Required");
export const zUuid = z.string().uuid("Invalid id");
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const zAmountString = z.string().trim().min(1, "Enter an amount");
export const zPassword = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  );

export function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): z.infer<T> {
  return schema.parse(raw);
}
