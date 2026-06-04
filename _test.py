import sys
sys.stdout.reconfigure(encoding="utf-8")
filepath = "E:\Code\open-game-launcher\FEATURE_PLAN.md"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()
print(f"File size: {len(content)} chars")
print(f"Has old line 5 ref: {'docs/plans/' in content}")
# Count remaining refs
count = content.count("docs/plans/")
print(f"Remaining docs/plans/ references: {count}")
