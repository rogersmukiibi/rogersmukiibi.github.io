---
name: check-in
description: Review progress against the current week's tracker in drafts/Habit3 — a daily quick check-in or an end-of-week review. Marks off completed goals, reports what's still open, and prepares the unfinished-items list to feed into the next plan-week pass. Use when the user asks what's done this week, wants to log progress, update their tracker, or review the week.
---

# Check In

Companion to the `plan-week` skill. Updates the current week's file rather than regenerating it.

Since 2026-W38, each week lives in its own folder: `drafts/Habit3/<YYYY-Www>/`, holding both `<YYYY-Www>.md` (the tracker) and that week's daily notes (`<YYYY-MM-DD>.md`) side by side. Older weeks predate this: a flat `drafts/Habit3/<YYYY-Www>.md` plus a shared `drafts/Habit3/Daily Notes/` folder for all historical daily notes.

Obsidian's Daily Notes plugin only supports one static creation folder (no per-week templating), so it's kept pointed at `drafts/Habit3/Daily Notes` as a landing spot — the user's phone and laptop both create new daily notes there via the plugin hotkey. That folder also sometimes holds `*.sync-conflict-*.md` files from Syncthing (the vault syncs between devices) — never ignore these silently; see step 1.5.

## Steps

1. **Find the current week's file.**
   - Run `date +%G-W%V` to get the current ISO week, then look for `drafts/Habit3/<YYYY-Www>/<YYYY-Www>.md`.
   - If it doesn't exist, tell the user and suggest running `plan-week` first — don't invent one.

1.5. **Sweep the Daily Notes inbox.**
   - Check `drafts/Habit3/Daily Notes/` for any dated `<YYYY-MM-DD>.md` files (new notes land here regardless of which week's folder is "current" — Obsidian doesn't know about the folder-per-week convention). Move any into the matching `drafts/Habit3/<YYYY-Www>/` folder, creating it if needed. Leave the template and any non-dated files where they are.
   - Also check for `*.sync-conflict-*.md` files anywhere under `drafts/Habit3/` (Syncthing conflict copies from editing on both phone and laptop). Diff each against its live counterpart: if the conflict copy has real, un-merged content (edits the live file doesn't have), surface it to the user and ask how to reconcile — don't silently pick one side or delete it. If it's already fully superseded (nothing in it isn't already in the live file), you can merge any small stragglers into the live file and remove the conflict copy, telling the user what you did.

2. **Read it.**

3. **Pull in this week's daily notes.**
   - Compute the current ISO week's Monday–Sunday date range. For 2026-W38 onward, read any `<YYYY-MM-DD>.md` files sitting directly in that week's own folder; for older weeks, look in `drafts/Habit3/Daily Notes/` instead.
   - Use them as evidence of what's actually been happening — quote or reference specifics when reporting status. Don't silently mark goals complete purely from inference; surface what the notes suggest and confirm with the user, especially anything ambiguous.
   - If the weekly file doesn't yet have a `## Daily Notes` section (see `plan-week`'s Daily Notes step), add one linking all seven days of the week. If it exists, leave it as-is — the links don't need updating, only the notes they point to change.

4. **Ask what's been done.**
   - Don't assume completion from silence. Ask the user which numbered goals (or schedule items) they've finished — "today" for a daily check-in, "since we last checked in" if it's been a few days — and cross-check against anything the daily notes already suggested. Flag anything the notes hint is done that the user didn't mention, rather than assuming.

5. **Update the file.**
   - Flip `- [ ]` to `- [x]` **and wrap the goal text in `~~strikethrough~~`** for each confirmed-done item, in **both** places it appears (Roles & Goals and Weekly Priorities share the same numbering, so check both). A bare `[x]` without strikethrough is not enough.
   - **New task discovered, or a pivot mid-task:** when the user describes work that turned into something different from the original goal — started a task, found it needed a different approach, then worked on that instead — don't just leave the original checkbox sitting open with no context, and don't silently repurpose it either. Add a **new** numbered goal (next available number) describing what was actually worked on, leave the original goal unchecked, and annotate the original inline noting it's superseded (e.g. "started, found draft direction off; scope now superseded by (16)"). If the original goal's literal wording was already satisfied (e.g. a "Start doing X" goal where they did start X, then moved into specifics), check the original off as done *and* add the new goal for the follow-on work — both are true at once.
   - **New task or commitment the user mentions that isn't in the tracker yet** (a meeting, an event, a task they're finalizing): add it immediately as a new numbered goal under the right role, and place it in the Schedule table at the time given — don't just ask "want me to add it?" and leave it uncaptured pending an answer. Reserve questions for genuinely ambiguous details (an unclear time, which role it belongs under), not for whether to capture it at all.
   - Don't touch items the user didn't mention — this is an incremental update, not a regeneration.
   - **Every check-in updates the Schedule table too**, not just the goal checkboxes — new tasks, meetings, and recurring commitments (e.g. a standing weekly meeting the user has mentioned before) belong in the relevant day/time cell.

6. **Report status.**
   - Short summary: X/Y goals done this week, grouped by role, and which of this week's Priorities are still open.

7. **End-of-week review** (Friday evening through Sunday, or whenever the user asks for a week review):
   - Summarize completion rate per role/dimension.
   - List the still-unchecked goals plainly — this is the candidate carryover list.
   - Ask if they want to plan next week now, and offer to hand off to `plan-week` if so.
