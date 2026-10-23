# 10 — Give settings sections real headings and groups

- Priority: P3
- WCAG: 1.3.1 Info and Relationships (A); 2.4.6 Headings and Labels (AA)
- Files: `src/ui/controls.ts`
- Depends on: plan 02 (dialog heading)

## Problem

`createSection()` renders the section title as
`div.section-title` (`src/ui/controls.ts:91`). The panel has one `h1`, but the
sections below it are not headings, and the controls are not programmatically
associated with their section. A screen-reader user cannot jump by heading or
tell which section a checkbox belongs to.

## Implementation

1. In `createSection()` generate a unique id:
   ```ts
   let sectionSeq = 0;
   const headingId = `ytx-section-${++sectionSeq}-title`;
   ```
2. Build the title as an `h2` instead of a `div`, keeping the class:
   ```ts
   const legend = createElement('h2', {
     id: headingId,
     text: title,
     class: 'section-title'
   });
   ```
   The note span continues to be appended to it.
3. Add `role="group"` and `'aria-labelledby': headingId` to the returned
   `.ytx-settings-section` container.
4. Leave all existing CSS selectors alone: `.ytx-settings-section >
.section-title` and `.ytx-grid > .section-title` match by class, not tag.
   Verify the default `h2` margin is overridden by the existing
   `margin: 0.6vh 0 0.5vh` rule (`ui.css:463-470`).
5. Keep heading order: `h1` panel title → `h2` section titles. Do not add an
   `h3` unless a section nests another section (it does not).
6. Section ids must be unique across the panel. The counter is module-scoped,
   and sections are created once (pages build lazily), so the ids are stable
   for the page lifetime.

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
