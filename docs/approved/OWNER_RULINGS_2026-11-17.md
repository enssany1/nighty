# Owner rulings – 17 November 2026

These rulings were given by the product owner after using the public deployment. They amend the approved product design where they differ from it.

## 1. A new operational day opens automatically

**Problem observed:** the deployment stayed on 15 November because nobody pressed Handover on the last shift. The landing view then asked for today's date, found no canvas, and "Return to current day" led back to the 15th.

**Ruling:** when the date changes, Nighty starts the new operational day by itself.

- "Today" is evaluated in the configured application time zone (General settings, default `Asia/Muscat`). The operational day starts with the first shift, so the hours before that start still belong to the previous operational date.
- When the active shift belongs to an earlier operational date, Nighty closes it, opens today's operational day, and activates the shift scheduled for the current time. With overlapping shifts the most recently started one is chosen.
- Open Follow actions move to the newly opened shift exactly once, exactly as they do at Handover.
- Shifts that were skipped (the rest of the stale day, and earlier shifts of the new day) are closed without entries. Calendar days that passed with no activity are not created.
- The change is recorded in Audit as `SHIFT_AUTO_ROLLOVER` with no acting user.
- Handover between shifts of the same operational day remains manual and is still never forced by the clock.
- The rollover runs when anyone asks for the current operational day; the web client asks on load, every minute, and when the window regains focus.
- Setting `DAY_ROLLOVER=manual` on the API restores the original Handover-only behavior.

## 2. Entries save automatically; the Submit button is removed

**Problem observed:** Update and Follow entries did not appear on the board until Submit was pressed, which was easy to miss.

**Ruling:** the composer saves while the author types.

- An Update, Follow or To-do list is created on the first pause in typing and appears on the board immediately. Further typing updates that same entry.
- Pressing Enter on an empty last line (Enter twice), or Ctrl+Enter, completes the entry and leaves an empty composer for the next one. A To-do list completes the same way it always did: Enter twice on an empty row.
- Saves made while the same author keeps typing are folded into the entry: they add no revision and no Audit event. A revision is recorded when someone edits an entry after a pause of two minutes or more, when a different person edits it, and for every explicit (non-autosave) edit.
- Images and files are uploaded as soon as the entry they belong to has text.
- Pending text is saved before Handover, when the tab is hidden and when the composer closes. If a save fails, the text stays in the composer and on the device.
- The landing view always opens the server's current operational day and follows it into a new day; a day opened from the calendar stays on screen.

## 3. Typed slash commands, formatting and colours

- Commands can be typed in full or in part (`/follow`, `/fol`, `/update`, `/to-do-list`) and picked with Enter, Tab or a space; arrows move through the list and Esc keeps the text. A command being typed is never saved.
- Formatting commands: `/h1`, `/h2`, `/h3`, `/bullet`, `/num`, `/quote`, `/code`, `/divider`. Insert commands: `/now` (current time) and `/today` (today's date). They change the text, not the kind of entry.
- Selecting text shows a toolbar with bold, italic, underline, strikethrough and seven Notion-style colours for text and for background. The API accepts only those colours.
- The composer is part of the canvas: the entry being typed sits in the same columns as the saved entries, with its type and time on the left, on the same background, instead of in a separate white box.

## 4. A free composer and a large current shift

- The empty composer shows no action. The label appears only after the author picks an action with `/` or starts writing (plain writing is an Update).
- On a day with an active shift, previous and upcoming shifts start collapsed to a single line with their entry count; clicking the header expands or collapses them. The current shift stays open with a large writing area. On a past day with no active shift, every shift starts open.
