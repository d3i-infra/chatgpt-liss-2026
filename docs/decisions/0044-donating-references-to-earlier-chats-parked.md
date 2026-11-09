---
status: proposed
date: "2026-11-09"
tags:
    - chatgpt
    - consent-viz
    - future-work
    - privacy
category: Extraction
applies_to:
    - packages/python/port/platforms/chatgpt.py
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/chat_conversation.tsx
    - packages/data-collector/src/components/consent_form_viz/visualization_plugin/figures/genuiMarkup.ts
---

# Donating references to earlier chats (parked)

## Decision

Open, for future development: references to the participant's earlier chats (ChatGPT's "Past chat" sources, a gpt-6 `<MemoryCite>`) are not donated for now. A working implementation is parked on the branch `park/memory-references`.

## Guidance

- The export keeps them per message in `metadata.conversation_context_citation_metadata`: the earlier chat's title, link, date and the user's first question in it.
- On master the extractor doesn't read them and `genuiMarkup` drops `<MemoryCite>` from the text, so nothing about earlier chats reaches the consent page or the donation.
- The parked branch adds a `memory references` column, shows those chats as a "Memory" section in an answer's sources (as in ChatGPT's own), and lets a `<MemoryCite>` open them. It was rebuilt on 2026-11-09 on top of `6ded615`; expect to rebase it.
- Before adopting it, solve the problem below, for example by leaving out references to conversations the participant removed from the donation, and explain the remaining case on the consent page.

## Why

A reference to an earlier chat lives inside a later conversation. If a participant removes a conversation from their donation, its title and first question could still reach the researchers through a later conversation that refers to it. That is unclear to participants and hard to prevent automatically, so the references were left out of the LISS 2026 study.
