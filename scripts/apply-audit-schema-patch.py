from pathlib import Path

path = Path("convex/schema.ts")
source = path.read_text(encoding="utf-8")
old = '''  })
    .index("by_user", ["userId"])
    .index("by_module", ["module"])
    .index("by_action", ["action"]),
'''
new = '''  })
    .index("by_user", ["userId"])
    .index("by_module", ["module"])
    .index("by_action", ["action"])
    .index("by_branch", ["branchId"])
    .index("by_branch_module_action", ["branchId", "module", "action"])
    .index("by_user_module_action", ["userId", "module", "action"])
    .index("by_module_action", ["module", "action"]),
'''

if new in source:
    raise SystemExit(0)
if old not in source:
    raise SystemExit("audit schema anchor not found")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
