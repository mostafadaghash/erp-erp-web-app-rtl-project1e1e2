import { convexAuth, getAuthUserId } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { query, type MutationCtx } from "./_generated/server";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    /**
     * Password sign-up is public only while the system has no active admin.
     * Throwing here rolls back the user/account creation transaction, so
     * hiding the sign-up control in the UI is not the security boundary.
     */
    async afterUserCreatedOrUpdated(ctx, args) {
      if (args.type !== "credentials" || args.existingUserId !== null) {
        return;
      }

      // Convex Auth types this callback against its system tables, while the
      // transaction also has access to the application's generated data model.
      const appCtx = ctx as unknown as MutationCtx;
      const activeAdmin = await appCtx.db
        .query("userProfiles")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      if (activeAdmin) {
        throw new Error(
          "إنشاء الحسابات الجديدة مغلق. تواصل مع مدير النظام للحصول على دعوة.",
        );
      }
    },
  },
});

export const loggedInUser = query({
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    const user = await ctx.db.get(userId);
    if (!user) {
      return null;
    }
    return user;
  },
});
