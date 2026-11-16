---
status: proposed
date: "2026-11-16"
source: Danielle McCool, perf/donate-bytes-through-worker (b19f6ca); replaces the staged-reference route (former ADR-0041, reverted)
category: Data collector
applies_to:
    - packages/data-collector/src/components/consent_form_viz/consent_form_viz.tsx
    - packages/data-collector/src/components/consent_form_viz/donation_parts.ts
    - packages/feldspar/src/framework/command_router.ts
    - packages/feldspar/src/framework/processing/worker_engine.ts
    - packages/python/port/helpers/flow_builder.py
companions:
    - packages/feldspar/src/framework/types/commands.ts
    - packages/python/port/api/commands.py
    - packages/data-collector/public/py_worker.js
---

# Donate consent-page data as UTF-8 bytes passed through Python untouched

## Decision

The consent-viz page donates its reviewed data as UTF-8 bytes in standalone `Uint8Array`s, since ADR-0047 a list of parts. The bytes are transferred (not cloned) to the worker, pass through Python as unconverted JsProxies into `CommandSystemDonate.json_string`, and each part is decoded to a string exactly once, in `CommandRouter`, right before `bridge.send`. No staging store or custom payload type is used.

## Guidance

- In Python, never convert the donated JsProxy (`str(...)`, `.to_py()`, `.to_bytes()`, `json.loads`) on the default path; `len()` for the size log and JS-side `slice()` copies (ADR-0047's retry) are fine. Converting a large donation in Pyodide costs hundreds of MB.
- Keep the `Uint8Array` standalone (`byteOffset 0`, owning its whole buffer) so `WorkerProcessingEngine` and `py_worker.js` can transfer it; a view on a shared buffer is cloned instead.
- `CommandRouter` echoes the command back to the worker with `json_string: ''`; nothing in the worker or Python reads the echoed donation.
- `PayloadJSON` with a plain string and `CommandSystemDonate` with a string `json_string` stay valid (decline record, error report, other prompts).
- A step that must change the data before donation (e.g. encryption) belongs in Python on this route, accepting the memory cost of converting it there; measure it against ADR-0034 first.
- Still guard repeated activation of the donate button (Eyra review R07): each activation encodes a full copy.

## Why

Measured 2026-11-16 (ddp-stress-lab, 1-year archive in 8 MB parts, two runs per route, desktop and an 8 GB-laptop profile): browser and page peaks equal the staged-reference route within run-to-run noise; Python heap does not grow while donating; the donation is byte-identical (131 MB). The bytes route keeps the standard Feldspar command and payload types (widened to `string | Uint8Array`), keeps the data reachable in Python before donation, and has no retained staged payloads — addressing Eyra's remarks on Feldspar divergence, Python-side modification, and R07's retained copies.
