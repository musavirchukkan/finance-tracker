import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * Request-scoped session read. Layout + page + nested helpers that call
 * `requireUser` / this helper share one Auth.js decrypt per RSC request.
 */
export const getSessionUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
});

export async function requireUser() {
  const user = await getSessionUser();
  if (!user?.id) {
    redirect("/login");
  }
  return user;
}
