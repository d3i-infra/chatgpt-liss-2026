---
status: accepted
date: "2026-11-16"
tags:
    - donation
    - memory
source: Eyra code review R01/R02 (2026-11-11); tested on Next 2026-11-16
category: Data collector
applies_to:
    - packages/data-collector/src/components/consent_form_viz/donation_parts.ts
    - packages/data-collector/src/components/consent_form_viz/consent_form_viz.tsx
    - packages/data-collector/src/components/progress/factory.tsx
    - packages/feldspar/src/framework/processing/worker_engine.ts
    - packages/python/port/helpers/flow_builder.py
    - packages/python/port/helpers/port_helpers.py
companions:
    - packages/python/port/api/d3i_props.py
    - scripts/donation/reassemble.py
    - packages/python/tests/test_donation_chunks.py
---

# Donate in parts of at most 25 MB, each its own request, retried until confirmed

## Decision

The consent page writes the donation straight into UTF-8 parts of at most `DONATE_PART_BYTES` (25 MB) without building the whole JSON string. `FlowBuilder` donates each part as its own request under `{session_id}-{platform_key}_part{i}of{n}`, keeps it until the host confirms it, and retries failed parts. In part order the parts concatenate to exactly the donated JSON.

## Guidance

- `DONATE_PART_BYTES` is set in `d3i_props` and reaches the page as `donatePartBytes`; `encodeJsonParts` writes the parts, and they go to the worker as one `PayloadJSON` whose value is a list of standalone `Uint8Array`s (transferred, not copied). A single part keeps the plain key (ADR-0020). A progress page is shown per part.

- Never build the full donation as one string or byte array, in the page or in Python: that copy is the memory peak this route removes.
- Every part must be a standalone `Uint8Array` (own whole buffer) so it can be transferred; send a `slice()` copy and keep the original in the worker until the host confirms it (`handle_donate_result`), then release it. Only that way can a failed part be sent again.
- A failed part is retried once automatically; then the participant chooses Try again (same part; parts already sent stay) or Stop (donate-failure page, `TaskIncompleteError("donation_failed")`, ADR-0039).
- The review page answers the flow once: `handleDonate` and `handleCancel` start with `claimOnce`, so a repeated activation encodes no second copy (Eyra review R07).
- The progress page (`PropsUIPromptProgress`) answers `PayloadVoid` on mount, so the next donate command runs while it stays on screen.
- Researchers reassemble with `scripts/donation/reassemble.py` (it checks completeness, JSON validity and row counts); the key format is agreed with them.
- The total donation is capped at Next's request limit (210 MB) by the extraction budget (to be implemented); parts lower the memory peak, they do not raise the cap.
- Measure memory-relevant changes to this route on the 8 GB-laptop profile (ADR-0034).

## Why

Before this, the donate click built the whole donation several times at once (JSON string, bytes, decoded string, the host's copy), about 12× the donation size in total. That crashed an 8 GB laptop at ≈185 MB. With parts made by the page, 218 MB completes at 4,124 of 5,000 MB and 242 MB at 4,774 (ddp-stress-lab, 2026-11-16). On Next a 242 MB donation arrived as 10 files that reassemble byte-for-byte (54,623 rows). Mono stores each request as its own file and needs no change; one key per part prevents overwriting, since mono's final file name carries no timestamp.
