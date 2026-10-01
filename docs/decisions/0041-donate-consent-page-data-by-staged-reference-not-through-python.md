---
status: proposed
date: "2026-10-01"
tags:
    - donate-protocol
    - memory
category: Performance
applies_to:
    - packages/feldspar/src/framework/staged_donations.ts
    - packages/feldspar/src/framework/command_router.ts
    - packages/data-collector/src/components/consent_form_viz/consent_form_viz.tsx
    - packages/python/port/helpers/flow_builder.py
companions:
    - packages/python/port/api/commands.py
    - packages/python/port/helpers/port_helpers.py
    - packages/feldspar/src/framework/types/commands.ts
---

# Donate consent-page data by staged reference, not through Python

## Decision

The consent-viz page stages its serialized donation and answers consent with a `PayloadStagedDonation` (id and length only). `FlowBuilder` donates it by reference with `ph.donate_staged`, and `CommandRouter` substitutes the staged data just before `bridge.send`, so the donated data never enters the worker or Python.

## Guidance

- The donate command for a staged payload carries `staged_id` and an empty `json_string`; `stageDonation` lives in feldspar's `staged_donations.ts` and is exported for UI components.
- Python keeps every decision around the donation: when it happens, the session-platform key (ADR-0020), the decline record, logging, and handling the host's reply (ADR-0021, ADR-0036). Only the data's route changes.
- Resolve staged payloads only in `CommandRouter`, right before `bridge.send`, so both bridges and the host protocol stay unchanged. Keep the id-only command in the `Response` posted back to the worker; never put the resolved data in it.
- A staged payload is donated at most once (`takeStagedDonation` removes it); an unknown id resolves to a failed `PayloadResponse`, which shows the donation-failure page.
- `PayloadJSON` with the full data stays supported for prompts that do not stage. A step that must change the data in Python after review needs that route, at its memory cost.
- The staging store and router step are generic feldspar capabilities, not study-specific behaviour (ADR-0002); offer them upstream.
- The donated bytes are exactly what `serializeConsentData()` produced (ADR-0031); verify size equality when measuring.

## Why

The round trip page → worker → Python → worker → page cost more memory than any other step. On the 6-month ChatGPT benchmark archive (61 MB donation) the worker held 1.5 GB of JavaScript while donating, 2.8 GB on the 1-year archive, which crashed Chrome. A live run on next.eyra.co showed the same +1.4 GB spike. With staging, desktop peaks dropped from 3.4–3.6 GB to 2.0–2.2 GB (6 months) and the 1-year archive completed at 3.7 GB (131 MB donation), with byte-identical donations (ddp-stress-lab findings, 2026-10-01).
