---
status: proposed
date: "2026-11-16"
tags:
    - extraction
    - donation
    - error-handling
source: Eyra code review 2026-11-11, finding R03
category: Extraction
applies_to:
    - packages/python/port/platforms/**/*.py
    - packages/python/port/helpers/table_extractor.py
    - packages/python/port/helpers/flow_builder.py
    - packages/data-collector/src/components/consent_form_viz/serialized_table.ts
companions:
    - packages/python/port/helpers/port_helpers.py
    - packages/python/port/api/d3i_props.py
    - packages/data-collector/src/components/consent_form_viz/consent_form_viz.tsx
    - packages/python/tests/test_chatgpt_malformed.py
---

# Skip unreadable items individually, tell the participant, donate the counts

## Decision

An extractor skips only the smallest unit it cannot read (file part, conversation or message) and counts it under `ph.SKIPPED_*`. The participant is told what was skipped before review, and each donated table carries its error counts as `"extraction errors"`, next to `"deleted row count"`.

## Guidance

- Never wrap a whole extraction loop in one `try/except`: one unexpected value must not empty the table.
- Missing or `null` text is not an error: it yields an empty message (e.g. `chatgpt.message_text`). Count a skip only when an item cannot be read at all.
- `run_extraction` attributes counts to a table as the counter delta around its extractor; `result.errors` keeps the total for the PII-free host log.
- The donated `"extraction errors"` object is always present (`{}` when none), so parsers can rely on it. It holds counts only, never exception or participant text (ADR-0022/0023).
- The notice names only skipped data. Quality counts such as `TimestampParseError` are donated but not shown, since nothing was left out.
- Zero tables with errors stays the unreadable-file page (ADR-0019).

## Why

A single malformed message used to empty the whole ChatGPT table, so participants could not donate otherwise valid data (Eyra review R03). Skipping silently would make the donation incomplete without anyone knowing. The participant must know before consenting, and the researcher needs the counts to interpret the data, just as with participant deletions.
