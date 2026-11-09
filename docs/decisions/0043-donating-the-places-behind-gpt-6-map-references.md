---
status: proposed
date: "2026-11-09"
tags:
    - chatgpt
    - consent-viz
    - future-work
category: Extraction
applies_to:
    - packages/python/port/platforms/chatgpt.py
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/chat_conversation.tsx
companions:
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/genuiMarkup.ts
---

# Donating the places behind gpt-6 map references

## Decision

Open, for a future study: whether the ChatGPT extractor should donate the resolved places of gpt-6 maps, which the export keeps in `metadata.view_state.widgets`. The current study (LISS 2026) can no longer change which fields it extracts, so for now it doesn't.

## Guidance

- A gpt-6 `<MapWidgetV2>` lists its points either written out (name, address, sometimes an emoji icon) or as a reference to a search result (`{"ref":"turn731164business10"}`). The viewer names the written-out ones and counts the references ("Places whose name is not in your data: N"); see `resolveLayoutMap` in `chat_conversation.tsx`.
- For some maps the export resolves those references in the message's `metadata.view_state.widgets["<message id>:<n>"].points`: name, address, category, coordinates, provider and `refs` linking each point to its reference. Seen in the sample export of 2026-11-09 for one of three maps; the other two had empty points there, one with only a `title`.
- Donating them means adding a column (or field) to the extraction, so it needs the study's consent and data-management review, like any new donated field. The places are the same kind of data as the older models' map references, which are already donated in `content references`.
- If adopted: extract only the map points (not the whole `view_state`), match them to the markup's references through `refs` (`turn_index` + `ref_type` + `ref_index`), and keep counting the references that stay unresolved. Never guess a place for an unresolved reference.

## Why

Participants see a map card that counts places without naming them, while the same places are often named in the answer's text. Donating the resolved points would show them exactly what the map showed, but it changes what is donated, which the current study can't do anymore.
