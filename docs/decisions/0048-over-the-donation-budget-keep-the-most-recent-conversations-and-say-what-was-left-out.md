---
status: accepted
date: "2026-11-16"
tags:
    - donation
    - memory
source: Eyra code review R01/R02 (2026-11-11); decided 2026-11-16
category: Extraction
applies_to:
    - packages/python/port/helpers/size_cap.py
    - packages/python/port/platforms/chatgpt.py
companions:
    - packages/python/port/helpers/port_helpers.py
    - packages/python/port/helpers/device.py
    - packages/python/tests/test_size_cap.py
---

# Over the donation budget keep the most recent conversations and say what was left out

## Decision

An export whose donation would exceed the budget (210 MB; lower when the browser reports 4 GB of RAM or less) keeps every conversation more recent than a cutoff and leaves out the older ones. The participant is told before consenting, and the counts, budget and first included date are donated with the table.

## Guidance

- Select while reading (`RecentFirstSelection`), one conversation at a time, so Python holds at most the budget plus one conversation; export parts are not chronological, so never assume order.
- Keep the selection a clean cutoff: once a conversation is left out for size, every older one is too, even a small one that would fit.
- A conversation's recency is its latest readable message time; without one it counts as oldest. Whole conversations only, never part of one.
- Estimate size as the page writes it (`row_bytes`: compact JSON, UTF-8); it errs slightly high, which is the safe side.
- Donate `SizeCapLeftOutConversations`, `SizeCapIncludedConversations`, `SizeCapBudgetMB` and `SizeCapIncludedFrom` (YYYYMMDD) in `extraction errors`, only when something was left out; the review page shows the plain-language notice first (`ph.review_notice`).
- The low-memory budget applies only when `navigator.deviceMemory` reports ≤ 4; it can only lower the budget (device.py).
- The selection rule is confirmed by the research team (2026-11-16).
- When the donation is at least half the budget, the notice also asks the participant to close other browser tabs and keep this one open (`ph.LARGE_DONATION_FRACTION`); smaller donations never show it.

## Why

On an 8 GB laptop, a donation sent in parts (ADR-0047) completes at 218 MB but larger exports exhaust memory; 210 MB is also Next's request limit. Refusing large exports would waste data participants could share; a silent cap would corrupt it (ADR-0031). Keeping the most recent period whole, and saying so, keeps the data interpretable: researchers know exactly from which date the history is complete.
