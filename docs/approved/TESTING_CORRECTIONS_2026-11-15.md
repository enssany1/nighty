# Nighty Testing Corrections — 2026-11-15

Status: Approved by the product owner during live acceptance testing.

Authority: The product owner authorized Codex to implement and verify this correction batch unattended. DeepSeek is not part of this batch.

## Accepted corrections

1. The compact calendar renders only the week rows needed to contain the viewed month. For November 2026, the final row is 29–30 November and 1–5 December; no additional December row is shown.
2. Choosing `/To-do list` creates an inline checklist inside the active composer. Enter creates and focuses a new item; Enter on an empty item exits the checklist after two consecutive empty Enter actions. Users can remove one item or the whole checklist. Empty rows are ignored.
3. A to-do submission derives `plainText` from its non-empty item labels. A list with at least one populated item submits; an entirely empty list shows `Add at least one to-do item.` Backend validation details are never exposed to the operator.
4. A Follow transfers to the next shift exactly once. Completing it leaves it visible in that receiving shift, with completed styling and the completing user and time. A completed Follow is not transferred again.
5. Settings provides delete actions for users and shifts. An unused record is permanently deleted. A record referenced by history is archived/deactivated instead, remains available to historical records, and cannot be assigned for future work. The final active administrator is protected. Each outcome is audited.
6. The daily canvas uses the approved compact chronological layout: time, colored action label, content, nested interactive to-dos, and compact author/timestamp/history metadata. Carried-over Follow work remains prominent at the top.
7. The operations sidebar can be collapsed and expanded with an accessible control. The preference is remembered locally, the canvas uses the released width, and narrow screens use an overlay drawer instead of reserving permanent sidebar width.

## Constraints retained

- Browser-only responsive web application.
- Sans-serif typography throughout; Roman/serif display fonts are not used.
- Manual Handover remains independent of wall-clock timing.
- Shifts may overlap but the active schedule must cover the full 24 hours.
- Existing audit, retention, authentication, attachment, and historical-integrity rules remain in force.
