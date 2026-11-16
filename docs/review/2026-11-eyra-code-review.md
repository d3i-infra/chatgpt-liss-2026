# Response to the Eyra code review (2026-11-11)

Review: "Code Review: ChatGPT 2026 Data Donation Study" by Eyra for Centerdata, on commit
`f07f4c5` (follow-up inspection on `6ded615`). Per finding: the issue, where it comes
from, and what was changed.

**Memory optimizations.** The fork's memory work (`9e255a9` table to the page as bytes,
`7bfdfd9` word cloud and calendar removed, `457cb42` donation staged by reference) did
not cause R02–R06. It made R01 somewhat worse and R07 materially worse.

**Donation route replaced.** The staged route (`457cb42`, ADR-0041) is reverted. The page
now donates UTF-8 bytes that pass through Python unconverted (ADR-0046). Memory use is
the same (measured), it stays closer to standard Feldspar, and the data remains
reachable in Python before donation, e.g. for encryption (§2 of the review).

| # | Priority | Finding | Origin | Status |
|---|---|---|---|---|
| R01 | High | Large exports fail without explanation | Upstream code; worsened by memory work | **Fixed** |
| R02 | High | Donation size not checked against Next's limit | Missing check | **Fixed** |
| R03 | High | One malformed message empties the extraction | Upstream loop; fork content types | **Fixed** |
| R04 | High | Unreadable export shows a traceback, no retry | Upstream error flow | **Fixed** |
| R05 | Low | Invalid timestamps donated without indicator | Upstream helper | **Fixed** |
| R06 | Medium | Deployed artifact not linked to reviewed code | Release process | Open |
| R07 | Medium | No explicit guard against repeated donation | Memory work (`457cb42`) | **Fixed** |

## R01 — Large exports can fail without a clear explanation (High) · **Fixed**

**Issue:** all conversation parts were parsed into memory at once. Parts that ran out of memory were skipped without telling the participant. Building the review page then failed outside the error handling, leaving the participant on the upload page.

**Origin:** upstream code. `9e255a9` added a byte copy at the step that failed.

**Applied fix:**

- **Parts are read one at a time** and released after their rows are taken.
- **Size cap** (R02): an export over the budget keeps its most recent conversations, so the review page and donation stay within what the browser can handle.
- **"Your file is too large"** instead of a crash or "damaged file", when memory runs out while reading or building the review page. The participant can choose a file again or stop. No error report is offered, as a memory limit is not a bug.
- **A clear page when the processing worker fails** (Pyodide cannot start, or crashes). It explains the likely cause and how to retry, keeps technical details collapsed, and offers *Stop*.
- **Unreadable parts are disclosed** before review and counted in the donation (R03).

**Changed:** `port/main.py`, `port/helpers/` (`flow_builder.py`, `port_helpers.py`, `size_cap.py`, `device.py`, `extraction_helpers.py`), `port/platforms/chatgpt.py`, `public/py_worker.js`, `feldspar/.../worker_engine.ts`, `components/error_page/`. ADR-0048 new; ADR-0023 and ADR-0039 amended.

**Tests:** `test_chatgpt_parts_memory.py`, `test_too_large.py`, `test_size_cap.py`, `error_page.test.ts`, `worker_engine.test.ts`.

**Verified** (synthetic exports, simulated 8 GB laptop):

| Case | Before | Now |
|---|---|---|
| 744 MB of conversations in 15 parts* | out of memory building the review page, no explanation | completes: most recent 210 MB donated, participant told what was left out |
| A single 287 MB `conversations.json` | "damaged file" | "Your file is too large" |

\* Eyra reported only "2.17 GB, 15 parts, 3 failed". The 2.17 GB is mostly media, which costs no memory; the conversation size of 744 MB is our estimate.

## R02 — Donation size not checked against Next's request limit (High) · **Fixed**

**Issue:** the donation size was never checked against Next's 210 MB request limit, so large exports could fail at the very last step.

**Origin:** a missing check.

**Applied fix:**

- **Donation capped at 210 MB.** Above that, the most recent conversations are kept and older ones left out; once one is left out, all older ones are too, so the data is complete from a clear date (ADR-0048, selection rule agreed with the research team).
  - On computers whose browser reports 4 GB of RAM or less, the cap is 60 MB.
  - The participant is told before consenting how many conversations are included, from which date, and how many are left out. Large donations also get advice to close other tabs.
  - The donation records the counts, the cap and the first included date.
- **Sent in parts of at most 25 MB,** each its own request (ADR-0047). This keeps memory low: a 218 MB donation now completes on an 8 GB laptop, where 185 MB used to crash.
  - A failed part is retried automatically once, then the participant can try again or stop; parts already sent are kept.
  - Key per part: `<session>-chatgpt_part<i>of<n>`, agreed with the researchers, who reassemble with `scripts/donation/reassemble.py`.

**Changed:** `consent_form_viz/donation_parts.ts`, `components/progress/`, `feldspar/.../worker_engine.ts`, `port/helpers/` (`flow_builder.py`, `port_helpers.py`, `size_cap.py`), `port/platforms/chatgpt.py`, `scripts/donation/reassemble.py`. ADR-0047 and ADR-0048 new; ADR-0020, ADR-0031 and ADR-0046 amended.

**Tests:** `donation_parts.test.ts`, `test_donation_chunks.py`, `test_size_cap.py`, `worker_engine.test.ts`, `progress.test.ts`.

**Verified:** on Next, a 242 MB test donation arrived as 10 files that reassemble byte for byte, with no request refused. In the lab, a refused part arrived after one *Try again*.

## R03 — A single malformed message can cause the entire conversation extraction to fail (High) · **Fixed**

**Issue:** one `try/except` around all conversations meant a single unexpected value (e.g. `parts: null`) emptied the whole table.

**Origin:** upstream loop; the extra content types were added in this fork.

**Applied fix:**

- Missing text gives an empty message instead of an error.
- Anything else unreadable is skipped at the smallest level (file part, conversation or message), and only that item is dropped.
- The review page tells the participant what could not be read, with counts.
- Each donated table carries these counts in `"extraction errors"` (counts only, no error text).
- On a real export sample the table is unchanged.

**Changed:** `port/platforms/chatgpt.py`, `port/helpers/` (`table_extractor.py`, `port_helpers.py`, `flow_builder.py`), `port/api/d3i_props.py`, `consent_form_viz/`. ADR-0045 new.

**Tests:** `test_chatgpt_malformed.py`, `test_table_extractor_errors.py`, `test_flow_builder.py`, `serialized_table.test.ts`, `test_d3i_props_table_transfer.py`.

## R04 — Unreadable exports show a technical error without a retry option (High) · **Fixed**

**Issue:** an invalid or truncated export led to a page with a Python traceback and no way to choose another file.

**Origin:** upstream error flow.

**Applied fix:**

- An unreadable file gets its own page, "File could not be read", with *Choose another file* or *Stop*.
- Other unexpected errors show a plain message, with the traceback collapsed. After the participant reports or skips the error, it offers *Try again* or *Stop*.
- No error text reaches the host except in the error report the participant consents to.

**Changed:** `port/helpers/` (`flow_builder.py`, `port_helpers.py`), `port/main.py`, `port/api/d3i_props.py`, `components/technical_details/`. ADR-0019, ADR-0022 and ADR-0039 amended.

**Tests:** `test_chatgpt_unreadable.py`, `test_flow_builder.py`, `test_main_queue.py`, `test_main_start.py`, `technical_details.test.ts`, `tests/error-flow.spec.ts`.

## R05 — Invalid timestamps are included in the donated data without a quality indicator (Low) · **Fixed**

**Issue:** an unconvertible `create_time` was kept in the `time` column, indistinguishable from valid times.

**Origin:** upstream helper `epoch_to_iso`.

**Applied fix:**

- `time` is always ISO 8601 or empty.
- A new column, `unreadable time`, keeps the original value only when it could not be read, so nothing is lost.
- These rows are counted as `TimestampParseError` in the donation.
- A missing or `null` time counts as absent, not as unreadable.
- The viewer shows "Time unreadable" instead of a date.
- Other platforms are unaffected.

**Changed:** `port/helpers/extraction_helpers.py`, `port/platforms/chatgpt.py`, `chatgpt_config.json`, conversation viewer.

**Tests:** `test_chatgpt_malformed.py`, `prepareConversationData.test.ts`, `selectVisualizationColumns.test.ts`.

## R06 — Deployment artifact not unambiguously linked to reviewed code and configuration (Medium) · Open

**Issue:**

- There is no tag or release for the study version.
- `release.yml` builds nothing.
- `chatgpt_config.json` is generated at build time and excluded from version control.

**Planned fix:**

- We are aware of this issue and are planning on addressing this soon, but not in time for this study.

## R07 — Protection against repeated donation activation relies on the button layout (Medium) · **Fixed**

**Issue:** `handleDonate` had no in-flight guard; only the spinner overlay blocked a second click.

**Origin:** made worse by `457cb42`, whose staging store kept every extra copy. That store is gone since the route change (ADR-0046).

**Applied fix:** the review page answers the flow only once. Donate and Cancel both claim the page first, so a second activation does nothing and encodes no second copy of the donation, whatever the button layout.

**Changed:** `consent_form_viz/consent_form_viz.tsx`, `consent_form_viz/settle_once.ts` (new); ADR-0047 amended.

**Tests:** `settle_once.test.ts` (repeated Donate/Cancel encodes once); `tests/donation.spec.ts` (two activations in a row, faster than the spinner, give one submission).
