- after generating enough content to start like 30% of the subject, the rest of the generation or preparation of the content can be done in the background unless been viewed or requested

Start after ~30%, generate the rest later: worth doing, but it conflicts with the spec, so think it through first

It breaks two principles in CLAUDE.md:
- "All content is generated and saved locally before the streak starts." This rule exists so a lost connection or an expired key can't break your streak partway through a book. Generating on demand brings that risk back.
- "No background jobs." On mobile, "in the background" really means "while the app is open." So it would be "keep generating while you read," not true background work. That's fine, but the todo should say so.

The code also has a real dependency: splitIntoTasks balances tasks by card count, which isn't known until every chapter is generated. reapplyPlan already re-fits new cards into the plan, but if it runs while chapters are still arriving, the boundaries of tasks you haven't done yet keep shifting. Today's task could change while you're reading it. Several places also assume status === 'ready' means fully generated:
- src/db/tasks.ts:52
- src/llm/chat.ts:40
- app/chat.tsx:76
- app/book/[id].tsx:77

A cleaner design:
- Split the plan by chapters (the outline is known right away), not by cards. Each task then covers fixed chapters, and only the chapters for the next task or two need to exist.
- Make the book usable once its first N tasks are generated. Keep generating in order while the app is open, and generate a chapter on demand if you reach it before it's ready.
- Show a quiet "Next reading not prepared yet, connect to continue" state instead of a broken feed. Decide whether that state should protect the streak.

That changes the rules for both the plan splitter and the ready status, so I'd do it last, after the other two.

Small notes on the file itself

- It sits in docs/ while the real road