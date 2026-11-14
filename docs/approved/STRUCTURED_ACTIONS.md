# Structured Shift Actions

## Intent

Make the active-shift `/` menu create useful, interactive shift records instead of inserting labels that behave like ordinary text. The interaction must stay fast enough for a small 24/7 operations team.

## Goals

- Keep three clear action types: Update, To-do list, and Follow.
- Remove Decision and Issue because they do not add distinct behavior in version 1.
- Give every action type a distinct, accessible visual treatment that does not rely on color alone.
- Let a To-do list behave as a simple continuous list of checkbox items.
- Preserve Follow's existing automatic transfer to the next shift.

## Non-goals

- No assignees, due dates, priorities, notifications, recurring tasks, or backend persistence.
- Tag whiteboards keep their existing text-first behavior; this iteration does not add a structured To-do list builder to them. Decision, Issue, and Checklist are removed from their shared action menu for taxonomy consistency.
- No migration system; this remains an in-memory UX prototype.

## Selected approach

Use inline structured entries inside the existing composer. Selecting `/To-do list` replaces the plain textarea state with a compact inline builder rather than opening a modal. This keeps the operator in the shift flow and provides the clearest interaction at the lowest cost.

Alternatives considered:

- A modal builder was rejected because it interrupts rapid shift logging.
- Markdown-like checkbox syntax was rejected because it is less discoverable and easier to format incorrectly.

## Behavior

### Slash menu

The active-shift menu contains Update, To-do list, and Follow. Decision, Issue, and Checklist are removed from every `/` menu.

- Update keeps the current free-text composer.
- Follow keeps the current free-text composer and is carried to the next shift after Handover.
- To-do list opens an inline builder with one empty checkbox row and no custom title.

### To-do list builder

- The list starts with one empty checkbox row and has no custom title field.
- Enter creates and focuses the next checkbox row.
- Backspace on an empty row removes it and focuses the previous row.
- At least one non-empty item is required; blank rows are ignored on submission.
- Published to-do items remain independently checkable.

### Existing demonstration data

Existing Decision and Issue sample records are relabeled as Update so only the supported action taxonomy appears in the canvas and search examples.

## Visual treatment

Each type uses a label, icon, and color so meaning is not communicated by color alone:

- Update: neutral slate.
- To-do list: blue.
- Follow: amber.

Completed to-do items use checked controls, muted text, and a line-through treatment while remaining readable.

## Accessibility and responsive behavior

- All checkbox controls use native inputs with visible labels.
- Add/remove actions have accessible names and keyboard focus styles.
- Builders and published entries reflow within the existing canvas at narrow widths without horizontal scrolling.
- Disabled Submit states explain themselves through the visible required fields rather than color alone.

## Verification

- Confirm Decision and Issue no longer appear in the slash menu, timeline examples, or search examples.
- Create and submit a plain Update and a Follow entry.
- Create a multi-item To-do list with Enter; verify blank rows are ignored and each published item can be checked independently.
- Complete Handover and confirm Follow still transfers to the next shift.
- Verify keyboard use and render the composer at desktop and narrow widths.
- Run the production build and the existing Sites handoff test.
