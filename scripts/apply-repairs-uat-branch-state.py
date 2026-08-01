from pathlib import Path

path = Path("convex/repairs.ts")
text = path.read_text()
old = '''export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const repairs = await ctx.db.query("repairs").order("desc").collect();
    return filterByBranch(repairs, user).map((repair) =>
      publicRepair(repair, user.permissions.includes("view_profits")),
    );
  },
});'''
new = '''export const list = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const user = await requireModulePermission(ctx, "view_repairs", "repairs");
    const requestedBranchId = args.branchId;
    if (requestedBranchId) assertBranchAccess(user, { branchId: requestedBranchId });
    const branchId = user.role === "admin"
      ? requestedBranchId ?? user.branchId
      : user.branchId;
    if (!branchId) return [];
    const repairs = await ctx.db
      .query("repairs")
      .withIndex("by_branch_received", (q) => q.eq("branchId", branchId))
      .order("desc")
      .collect();
    return repairs.map((repair) =>
      publicRepair(repair, user.permissions.includes("view_profits")),
    );
  },
});'''

if new in text:
    raise SystemExit(0)
if old not in text:
    raise SystemExit("missing exact repairs.list source")
path.write_text(text.replace(old, new, 1))
