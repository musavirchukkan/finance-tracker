import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/constants";
import { UserFacingError } from "@/lib/safe-error";

/** Shared Zod pieces for FormData mutations (M2). */

export const zNonEmpty = z.string().trim().min(1, "Required");
export const zUuid = z.string().uuid("Invalid id");
export const zDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const zYearMonth = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Enter a valid month");
export const zAmountString = z.string().trim().min(1, "Enter an amount");
export const zPassword = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  );
export const zIncomeExpense = z
  .string()
  .transform((s) => (s === "income" ? ("income" as const) : ("expense" as const)));

export const zTxType = z
  .string()
  .transform((s) => {
    if (s === "income") return "income" as const;
    if (s === "transfer") return "transfer" as const;
    return "expense" as const;
  });

/** Empty → null; otherwise must be a UUID. */
export const zOptionalUuid = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s))
  .pipe(z.union([z.null(), zUuid]));

export function formString(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

export function formCheckbox(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true";
}

export function parseForm<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): z.infer<T> {
  return schema.parse(raw);
}

/** safeParse + UserFacingError (first issue message). */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  raw: unknown,
  fallback = "Invalid input",
): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new UserFacingError(
      parsed.error.issues[0]?.message ?? fallback,
    );
  }
  return parsed.data;
}
