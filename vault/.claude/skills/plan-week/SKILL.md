---
name: plan-week
description: Plan the upcoming (or current) week in the vault's weekly tracker under drafts/Habit3 — set goals across life dimensions (Individual, Family, Auri Tech, Xeno AI, Solar Irradiance, Faith, Rotaract, Others), pick weekly priorities, and lay them into the Schedule table. Use when the user asks to plan their week, set weekly goals, or invokes /plan-week.
---

# Plan Week

Produces a weekly tracker file following this vault's existing format — see [2026-W38](../../../drafts/Habit3/2026-W38/2026-W38.md) for the current folder-per-week layout and numbering convention (each week is its own folder holding the weekly file *and* that week's daily notes together).

## Layout

Each week lives in its own folder: `drafts/Habit3/<YYYY-Www>/`, containing:
- `<YYYY-Www>.md` — the weekly tracker itself
- `<YYYY-MM-DD>.md` — one file per daily note written that week, living directly in the same folder (no separate "Daily Notes" subfolder)

Weeks before 2026-W38 predate this layout: a flat `drafts/Habit3/<YYYY-Www>.md` file and a shared `drafts/Habit3/Daily Notes/` folder holding all historical daily notes. Handle both when searching for carryover context (see step 2), but always *create* new weeks in the folder layout.

Obsidian's Daily Notes and Periodic Notes plugins only support one static creation folder each (no per-week templating), so they stay configured as-is rather than being fought: Daily Notes still lands in `drafts/Habit3/Daily Notes`, and the weekly periodic-note feature still drops flat `drafts/Habit3/<YYYY-Www>.md` files (its format defaults to the same `gggg-[W]ww` style this project already uses). Both devices (phone + laptop) can trigger either. Rather than disabling these, `plan-week` is the place that reconciles the clutter dynamically, every run, before doing anything else:

- **Daily Notes inbox** — any dated `<YYYY-MM-DD>.md` file sitting in `drafts/Habit3/Daily Notes/` gets moved into its matching `drafts/Habit3/<YYYY-Www>/` folder (create it if needed). Leave the template and any non-dated files alone.
- **Stray flat weekly files** — any `drafts/Habit3/<YYYY-Www>.md` sitting directly in `drafts/Habit3/` (not inside its own folder) is a periodic-notes auto-create straggler. If `drafts/Habit3/<YYYY-Www>/<YYYY-Www>.md` doesn't exist yet, just move the straggler into that folder. If it already exists, diff the two: if the straggler is empty or template-only, delete it; if it has real content the folder version lacks, merge that content in and tell the user what got merged rather than silently dropping either side.
- **Sync-conflict files** — `*.sync-conflict-*.md` anywhere under `drafts/Habit3/` (Syncthing, from editing on both devices). Diff each against its live counterpart: merge-and-remove when fully superseded, surface to the user when there's real unmerged content rather than guessing which side wins.

This sweep runs unconditionally at the start of `plan-week`, whether or not the user is actively asking about clutter — it's what keeps the folder-per-week layout from drifting out of sync with what the plugins actually do.

## Steps

1. **Determine the target week.**
   - Run `date +%G-W%V` to get the current ISO week (e.g. `2026-W38`).
   - Folder/file convention: `drafts/Habit3/<YYYY-Www>/<YYYY-Www>.md`.
   - If that file already exists, treat this as an update/refinement pass on it — read it first, don't blindly overwrite checked state or filled-in cells. If it's late in the week (Fri–Sun) and the user seems to mean "next week", confirm which week they mean before picking a folder.

2. **Gather carryover context.**
   - List `drafts/Habit3/*/` week folders plus any legacy flat `drafts/Habit3/*.md` files matching `YYYY-Www.md`, sorted by name (this sorts chronologically), and read the most recent one before the target week.
   - Pull out any unchecked `- [ ]` items under **Roles & Goals** — these are carryover candidates.
   - Compute last week's Monday–Sunday date range and read any daily notes dated within it — inside that week's own folder for post-2026-W38 weeks, or in `drafts/Habit3/Daily Notes/` for older ones (filenames are `YYYY-MM-DD.md` either way). These often have more concrete detail than the checkbox states alone — use them to sharpen carryover items or notice things worth folding in that never made it onto the tracker.

3. **Collect this week's goals from the user.**
   - Ask what they want to accomplish this week across the roles used in this vault: Individual, Family, Auri Tech, Xeno AI, Solar Irradiance, Faith, Rotaract, Others (they don't need to fill every bucket — skip empty ones).
   - Present the carried-over unfinished items and ask, per item: carry forward, drop, or reword.
   - If the user already stated goals in the message that triggered this skill, don't re-ask — just confirm your read of them. Keep this to one or two exchanges, not a long form.

4. **Number the goals.**
   - Under each role heading in **Roles & Goals**, write goals as `- [ ] Goal text (N)`.
   - Numbers run sequentially across the *whole week*, not per-role, matching the convention in [2025-W40.md](../../../drafts/Habit3/2025-W40.md). Carried-over items get a fresh number for this week.

5. **Weekly Priorities.**
   - Ask which ~3–6 goals are the real priorities this week (or infer from what the user emphasized), and list them under **Weekly Priorities** as `- [ ] Goal text (N)`, reusing the same numbers.

6. **Schedule table.**
   - Reuse the table shape from the template: `Time | Monday | Tuesday | Wednesday | Thursday | Friday | Saturday | Sunday`, with a Priority row, hourly rows (8 AM–9 PM), and an Evening row.
   - For anything with a real-world time constraint (meetings, calls, recurring commitments visible in past weeks), ask the user rather than guessing. For flexible work blocks, propose a placement and let them adjust.
   - Reference goals in cells the same way as past weeks: `Goal text (N)`.

7. **Daily Notes section.**
   - Add a `## Daily Notes` section listing each day of the week as an Obsidian link to that day's note, e.g. `- Monday: [[2026-09-14]]` — include the link even for days that don't have a note yet (it just stays unresolved until the user writes that entry, which they'll create directly in this week's folder). This gives the weekly file a durable index into that week's daily notes for `check-in` and future review.

8. **Sharpen the Saw.**
   - This section is the Habit 7 ("Sharpen the Saw") renewal check from *The 7 Habits of Highly Effective People* — Physical / Mental / Spiritual / Social-Emotional. Don't leave it blank by default: propose one small, concrete renewal activity per dimension based on what's actually in the week's plan (e.g. a heavy desk/screen week suggests a physical activity to counter it; an empty Faith bucket suggests naming one small spiritual practice; a solo project-heavy week suggests one social/emotional connection point). Show the user your proposal and let them edit rather than silently accepting it — this is still their call, just don't hand them a blank template when you have enough context to draft something real.

9. **Write and confirm.**
   - Create `drafts/Habit3/<YYYY-Www>/` and save the file to `drafts/Habit3/<YYYY-Www>/<YYYY-Www>.md`, keeping the tags line and section order from past weeks.
   - Show the user the result (or a concise summary) and confirm it looks right before considering the task done — this is their planning document, not a fire-and-forget generation.
