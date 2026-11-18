---
name: learn
description: Use when Nathan requests /learn or the next Pennywise system-design module.
---

Resolve all paths from the Pennywise repository root (the ancestor containing `learning/`),
not from the caller's working directory. Read `learning/TEACHING.md` before proceeding.

Read `learning/progress.json`, `learning/curriculum.md`, and the relevant source lesson text.
Choose the explicitly requested module, otherwise the current in-progress module, otherwise
the first todo module. Do not restart skipped/completed modules unless requested.

Inspect the relevant Pennywise code/tests/deployment configuration before choosing a problem.
Use an existing engineering decision or improvement first; if no natural fit exists, create an
explicitly hypothetical Pennywise requirement/failure that teaches the concepts. Consider the
ongoing AWS integration where relevant without assuming services are deployed.

Create `learning/modules/NN-slug/BRIEF.md` with code references and observed/hypothetical status.
Open with the problem, ask one question, and wait. Follow the teaching contract: Nathan reasons
and attempts the work before explanations or solutions. Scaffold meaningful tests/experiments
on the real app as needed. Record TASKS.md and post-discussion NOTES.md in the module folder.

Update active progress/current and append a log entry when starting. Record the next unanswered
question as the session proceeds. Mark completed only after the concepts have been worked through.
