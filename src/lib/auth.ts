import { createHash } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH, SESSION_USER_RECHECK_MS } from "@/lib/constants";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getDatabaseFingerprintMaterial } from "@/lib/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(PASSWORD_MIN_LENGTH),
});

/**
 * Opaque hash of DB host+name. Computed only on the server from env
 * (never NEXT_PUBLIC_*). Stored in the JWT so a URL swap invalidates sessions
 * without putting the connection string — or even the host — in the client.
 */
function dbFingerprint(): string {
  return createHash("sha256")
    .update(getDatabaseFingerprintMaterial())
    .digest("hex")
    .slice(0, 16);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  // Required on Vercel so cookies/callbacks use the correct host
  trustHost: true,
  callbacks: {
    jwt: async ({ token, user }) => {
      const fp = dbFingerprint();

      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.db = fp;
        token.checkedAt = Date.now();
        return token;
      }

      if (!token.sub) return token;

      // Cookie still valid after DATABASE_URL swap — drop the session.
      if (token.db !== fp) {
        return null;
      }

      const checkedAt =
        typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (Date.now() - checkedAt < SESSION_USER_RECHECK_MS) {
        return token;
      }

      // User deleted or id from another DB that shares the same host path.
      const [row] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
        })
        .from(users)
        .where(eq(users.id, token.sub))
        .limit(1);

      if (!row) {
        return null;
      }

      token.email = row.email;
      token.name = row.name;
      token.checkedAt = Date.now();
      return token;
    },
    session: async ({ session, token }) => {
      if (!token?.sub) {
        return { ...session, user: undefined };
      }
      if (session.user) {
        session.user.id = token.sub;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  },
});
