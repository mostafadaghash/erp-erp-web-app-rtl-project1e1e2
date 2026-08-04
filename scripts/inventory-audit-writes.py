from pathlib import Path
import re

root = Path("convex")
rows: list[str] = []
rows.append("# Audit Write Inventory\n")
rows.append("Generated from the full repository checkout.\n")

mutation_pattern = re.compile(r"export const\s+(\w+)\s*=\s*(?:internalMutation|mutation)\s*\(")

for path in sorted(root.rglob("*.ts")):
    if "_generated" in path.parts:
        continue
    source = path.read_text(encoding="utf-8")
    mutations = [(m.group(1), source.count("\n", 0, m.start()) + 1) for m in mutation_pattern.finditer(source)]
    log_positions = [m.start() for m in re.finditer(r"\blogAction\s*\(", source)]
    if not mutations and not log_positions:
        continue

    rows.append(f"## {path.as_posix()}\n")
    rows.append(f"- Mutations: {len(mutations)}")
    rows.append(f"- logAction calls: {len(log_positions)}\n")
    if mutations:
        rows.append("### Mutation exports")
        for name, line in mutations:
            rows.append(f"- L{line}: `{name}`")
        rows.append("")

    if log_positions:
        rows.append("### logAction call sites")
        lines = source.splitlines()
        for index, pos in enumerate(log_positions, start=1):
            line = source.count("\n", 0, pos) + 1
            start = max(0, line - 4)
            end = min(len(lines), line + 12)
            rows.append(f"#### Call {index} at L{line}")
            rows.append("```ts")
            for number in range(start, end):
                rows.append(f"{number + 1:04d}: {lines[number]}")
            rows.append("```\n")

Path("tests/AUDIT_WRITE_INVENTORY.md").write_text("\n".join(rows) + "\n", encoding="utf-8")
