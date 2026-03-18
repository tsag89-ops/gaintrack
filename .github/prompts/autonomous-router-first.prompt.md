---
description: "Route this request through the Autonomous Router first so the best specialist is chosen automatically for the task."
name: "GainTrack Autonomous Router First"
argument-hint: "Describe your task"
agent: "Autonomous Router"
---
Route this task through the Autonomous Router and execute using the best specialist selection.

Task:
{{input}}

Requirements:
1. Infer the best primary specialist automatically.
2. For cross-domain work, split into minimal steps and hand off only when needed.
3. Optionally consult matching .vscode/subagents or .agency-agents personas when it improves quality.
4. Keep changes surgical and run focused validation relevant to the changed area.

Return format:
- Selected specialist(s)
- Why selected
- Files changed
- Validation run and result
