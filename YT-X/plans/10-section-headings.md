# 10 — Give settings sections real headings and groups

- Priority: P3
- WCAG: 1.3.1 Info and Relationships (A); 2.4.6 Headings and Labels (AA)
- Files: `src/ui/controls.ts`
- Depends on: plan 02 (dialog heading)

Status: implemented in code with unit tests; the TV checks below are open.

## Acceptance criteria

- [ ] AX tree shows `heading level=2` for every section title.
- [ ] Each `.ytx-settings-section` is a named `group` matching its heading.
- [ ] Heading navigation in a screen reader moves section by section.
- [ ] No visual change to section spacing, borders or grid spans.
- [ ] No duplicate ids; no id is regenerated on tab switches.

## Verification

- With the panel open, read the AX tree and confirm `h2`/`group` nodes.
- Compare a panel screenshot before/after; spacing must be identical.
- Check all five pages (some are built lazily on first activation) for unique
  ids: `document.querySelectorAll('[id^="ytx-section-"]').length`.

## Risks

- `h2` has a UA `font-size` and margins; the class rule sets both, but confirm
  in the webOS Chrome 79 engine.
- If a section is ever used outside the panel (e.g. SponsorBlock attribution),
  the heading/group is harmless but the id counter still applies.
- Do not add `aria-label` to the `h2`; the visible text is the name.
