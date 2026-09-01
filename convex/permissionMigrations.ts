import { mutation } from "./_generated/server";
import { requireAdmin, logAction } from "./lib/auth.ts";
import { ROLE_PERMISSIONS, ROLES } from "./lib/permissions.ts";

/**
 * Compatibility migration for installations that persist explicit role
 * permission arrays. Safe to run repeatedly after adding permission keys.
 */
export const reconcileRolePermissions = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const profiles = await ctx.db.query("userProfiles").collect();
    let updated = 0;
    let skipped = 0;

    for (const profile of profiles) {
      if (!(profile.role in ROLES)) {
        skipped++;
        continue;
      }
      const next = [...(ROLE_PERMISSIONS[profile.role] ?? [])];
      const current = profile.permissions ?? [];
      const same = current.length === next.length && current.every((permission, index) => permission === next[index]);
      if (same) continue;
      await ctx.db.patch(profile._id, { permissions: next });
      updated++;
    }

    await logAction(ctx, admin, {
      action: "reconcile_permissions",
      module: "employees",
      recordLabel: "Role permission compatibility migration",
      details: `Reconciled stored role permissions after sales-order lifecycle split: ${updated} updated, ${skipped} skipped`,
      after: { updated, skipped },
    });
    return { updated, skipped, total: profiles.length };
  },
});
