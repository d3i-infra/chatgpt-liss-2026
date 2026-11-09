---
status: accepted
date: "2026-11-09"
tags:
    - consent-viz
    - chatgpt
    - ux
category: Data collector
applies_to:
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/genuiMarkup.ts
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/chat_conversation.tsx
companions:
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/genuiMarkup.test.ts
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/chat_conversation.test.ts
---

# Show unknown chat widgets as a chip with their code on click

## Decision

When the chat viewer meets a structure in a message that it has no specific rendering for, such as a gpt-6 layout component (widget) it doesn't know, it shows a compact labelled chip ("Widget: Name") whose underlying code or data opens on click. It neither leaves the raw code inline nor drops it.

## Guidance

- Known structures get a readable rendering of their own (layout containers, badges, icons, image placeholders, maps, charts, form fields); everything else goes to the generic fallback, so a format change never shows participants raw code and never silently loses donated content.
- In `genuiMarkup`, an unknown component becomes a `layout_widget` marker carrying its name and its code: any capitalised tag (`<SliderWidget .../>`, or `<Tabs>...</Tabs>` with everything inside it), and a lowercase tag with a JSX expression attribute (`<slider value={x}/>`). Lowercase tags without one stay text, as they may be HTML in ordinary prose.
- The marker's code is JSON with the characters later conversion steps act on escaped, so the code reaches the viewer exactly as written; the details screen shows a string as plain text.
- Giving a new structure its own rendering is preferred when its content is donated text that reads better rendered (a list of places, a bar chart), but the click-to-inspect data must still be the complete underlying content.

## Why

Participants must understand what they donate. Raw component code is unreadable and obscures the content around it, while dropping unknown parts would hide donated data. A chip keeps the message readable and the full detail one click away; the same pattern older models' widgets already use.
