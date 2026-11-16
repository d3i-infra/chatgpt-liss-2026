"""Tests for FlowBuilder.start_flow() — all six flow paths.

FlowBuilder yields CommandSystemLog milestones between UI commands.
Tests use advance_past_logs() / start_and_skip_logs() to skip past
log commands to the next UI/donate command.

Per ADR-0026, PayloadFile is the only accepted upload type;
PayloadString/WORKERFS support was retired. The upload pipeline does
not materialize the file to a path — the AsyncFileAdapter is passed
directly to validate_file/extract_data, and size policy is enforced
via check_payload_size() against adapter.size before any read.
"""
import io
import json
import zipfile
from collections import Counter
from unittest.mock import MagicMock, patch

import pytest
from port.helpers.flow_builder import FlowBuilder, TaskIncompleteError
from port.helpers.uploads import FileTooLargeError
from port.helpers.archive_set import ArchiveSet
from port.api.commands import CommandUIRender, CommandSystemDonate, CommandSystemLog
from port.api.d3i_props import ExtractionResult
import port.api.props as props
import port.api.d3i_props as d3i_props
from port.helpers.validate import ValidateInput


class StubFlow(FlowBuilder):
    """Concrete FlowBuilder for testing."""

    def __init__(self, session_id="test-session", validation_status=0, tables=None):
        super().__init__(session_id, "TestPlatform")
        self._validation_status = validation_status
        self._tables = tables if tables is not None else [
            d3i_props.PropsUIPromptConsentFormTableViz(
                id="test_table",
                data_frame=__import__("pandas").DataFrame({"col": [1, 2]}),
                title=props.Translatable({"en": "Test", "nl": "Test"}),
            )
        ]

    def validate_file(self, file):
        v = MagicMock(spec=ValidateInput)
        v.get_status_code_id.return_value = self._validation_status
        v.current_ddp_category = MagicMock(id="json_en")
        return v

    def extract_data(self, file, validation):
        return ExtractionResult(tables=self._tables, errors=Counter())


def make_payload(type_name, **attrs):
    p = MagicMock()
    p.__type__ = type_name
    for k, v in attrs.items():
        setattr(p, k, v)
    return p


def make_payload_file(size: int = 1024) -> MagicMock:
    """Build a PayloadFile-shaped payload whose adapter reports `size` bytes.

    ADR-0026: the upload-path safety check reads adapter.size from JS
    metadata, never the bytes themselves. Tests construct adapters that
    only need a `.size` attribute set.
    """
    adapter = MagicMock()
    adapter.size = size
    return make_payload("PayloadFile", value=adapter)


def is_progress_page(cmd) -> bool:
    """A progress page (e.g. "Sending part 2 of 7") answers by itself, like a log."""
    return isinstance(cmd, CommandUIRender) and cmd.toDict()["page"]["body"][0]["__type__"] == "PropsUIPromptProgress"


def advance_past_logs(gen, response=None):
    """Send response to generator, skip any CommandSystemLog commands, return next non-log command."""
    cmd = gen.send(response)
    while isinstance(cmd, CommandSystemLog) or is_progress_page(cmd):
        cmd = gen.send(make_payload("PayloadVoid"))
    return cmd


def start_and_skip_logs(gen):
    """Start generator and skip any initial log commands."""
    cmd = next(gen)
    while isinstance(cmd, CommandSystemLog):
        cmd = gen.send(make_payload("PayloadVoid"))
    return cmd


class TestHappyPath:
    """User uploads valid file → extraction has data → consents → donates."""

    def test_happy_path_yields_donate(self):
        flow = StubFlow()
        gen = flow.start_flow()

        # Step 1: file prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Step 2: user uploads file → milestones → consent form
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # Step 3: user consents → milestones → donate command
        consent_payload = make_payload("PayloadJSON", value='{"data": "test"}')
        cmd = advance_past_logs(gen, consent_payload)
        assert isinstance(cmd, CommandSystemDonate)
        assert cmd.key == "test-session-testplatform"

        # Donate result → final milestone → generator exhausts
        with pytest.raises(StopIteration):
            advance_past_logs(gen, make_payload("PayloadVoid"))


class TestRetryPath:
    """User uploads invalid file → retries → uploads valid file → succeeds."""

    def test_retry_loops_back(self):
        call_count = [0]
        flow = StubFlow()

        def varying_validate(file):
            call_count[0] += 1
            v = MagicMock(spec=ValidateInput)
            v.get_status_code_id.return_value = 1 if call_count[0] == 1 else 0
            v.current_ddp_category = MagicMock(id="json_en")
            return v

        flow.validate_file = varying_validate

        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Upload invalid file → milestones → retry prompt
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # User clicks "Try again" → loops back → file prompt
        cmd = advance_past_logs(gen, make_payload("PayloadTrue"))
        assert isinstance(cmd, CommandUIRender)

        # Upload valid file → milestones → consent form
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

    def test_retry_declined_raises_abandoned(self):
        """Declining the retry prompt must NOT exhaust the generator (exit 0 /
        completed at the host) — it raises TaskIncompleteError with the
        participant-abandoned exit code so the host keeps the task pending."""
        flow = StubFlow(validation_status=1)
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Upload invalid file → milestones → retry prompt
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # User clicks "Continue" (declines retry)
        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadFalse"))
        assert exc.value.exit_code == 2


class TestSkipPath:
    """User skips file selection (anything other than PayloadFile)."""

    def test_skip_raises_abandoned(self):
        flow = StubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # User skips with non-PayloadFile response — emits an
        # "Upload skipped" diagnostic log, then ends abandoned so the
        # host keeps the task pending instead of completing it.
        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadFalse"))
        assert exc.value.exit_code == 2

    def test_payload_string_now_treated_as_skip(self):
        """SRC compat dropped per ADR-0026: PayloadString is not a valid upload."""
        flow = StubFlow()
        gen = flow.start_flow()

        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # PayloadString hits the same skip branch as any other non-PayloadFile,
        # which emits an "Upload skipped" diagnostic log and ends abandoned.
        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadString", value="/tmp/legacy.zip"))
        assert exc.value.exit_code == 2


class TestNoDataPath:
    """Valid file but extraction returns empty table list."""

    def test_no_data_shows_page_then_returns(self):
        flow = StubFlow(tables=[])
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Upload valid file → milestones → no-data page
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # User acknowledges
        with pytest.raises(StopIteration):
            gen.send(make_payload("PayloadTrue"))

    def test_no_data_with_extraction_errors_is_a_failure_not_a_completion(self):
        """Zero tables WITH extraction errors is an unreadable file, never the
        clean no-data acknowledgment (which completes) — see ADR-0019's
        no-data/extraction-bug separation. The participant gets the
        unreadable-file page (Eyra review R04), not a traceback; stopping there
        is abandonment, so the run stays pending (ADR-0039)."""
        flow = StubFlow(tables=[])
        flow.extract_data = lambda file, validation: ExtractionResult(
            tables=[], errors=Counter({"KeyError": 3})
        )
        gen = flow.start_flow()

        start_and_skip_logs(gen)
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)
        page = json.dumps(cmd.toDict())
        assert "File could not be read" in page
        assert "Choose another file" in page
        assert "No data found" not in page
        assert "KeyError" not in page

        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadFalse"))
        assert exc.value.reason == "abandoned"

    def test_unreadable_file_choose_another_loops_back_to_upload(self):
        """'Choose another file' returns to the upload prompt; a readable file
        then reaches the consent form."""
        good_tables = StubFlow()._tables
        results = [
            ExtractionResult(tables=[], errors=Counter({"JSONDecodeError": 2})),
            ExtractionResult(tables=good_tables, errors=Counter()),
        ]
        flow = StubFlow()
        flow.extract_data = lambda file, validation: results.pop(0)
        gen = flow.start_flow()

        start_and_skip_logs(gen)
        cmd = advance_past_logs(gen, make_payload_file())
        assert "File could not be read" in json.dumps(cmd.toDict())

        cmd = advance_past_logs(gen, make_payload("PayloadTrue"))
        assert cmd.page.body.__class__.__name__ == "PropsUIPromptFileInput"

        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd.page.body, d3i_props.PropsUIPromptConsentFormViz)


class TestSafetyErrorPath:
    """File fails safety check (oversize)."""

    @patch(
        "port.helpers.flow_builder.uploads.check_payload_size",
        side_effect=FileTooLargeError("too big"),
    )
    def test_safety_error_shows_page_then_raises_upload_rejected(self, mock_check):
        flow = StubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Upload file that fails safety → milestones → safety error page
        cmd = advance_past_logs(gen, make_payload_file(size=3 * 1024**3))
        assert isinstance(cmd, CommandUIRender)

        # User acknowledges → upload-rejected exit, not a completion
        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 4


class TestDonateFailurePath:
    """Donation fails after consent."""

    @patch("port.helpers.flow_builder.ph.handle_donate_result", return_value=False)
    def test_donate_failure_shows_page_then_raises_donation_failed(self, mock_handle):
        flow = StubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)

        # Upload valid file → milestones → consent form
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # User consents → milestones → donate command
        cmd = advance_past_logs(gen, make_payload("PayloadJSON", value='{"data": "test"}'))
        assert isinstance(cmd, CommandSystemDonate)

        # First failure → one automatic retry of the same donation
        cmd = advance_past_logs(gen, make_payload("PayloadResponse", success=False))
        assert isinstance(cmd, CommandSystemDonate)

        # Second failure → the participant is asked to try again or stop
        cmd = advance_past_logs(gen, make_payload("PayloadResponse", success=False))
        assert isinstance(cmd, CommandUIRender)
        assert "Try again" in str(cmd.toDict())

        # Stop → donate failure page
        cmd = advance_past_logs(gen, make_payload("PayloadFalse"))
        assert isinstance(cmd, CommandUIRender)
        assert "could not be submitted" in str(cmd.toDict())

        # User acknowledges → donation-failed exit, not a completion
        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 3

    @patch("port.helpers.flow_builder.ph.handle_donate_result", return_value=False)
    def test_decline_record_failure_stays_silent_completion(self, mock_handle):
        """A failed decline-record delivery is invisible infrastructure: the
        participant declined to donate, so the flow still completes (exit 0)."""
        flow = StubFlow()
        gen = flow.start_flow()

        start_and_skip_logs(gen)
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)

        # User declines consent → decline record donated
        cmd = advance_past_logs(gen, make_payload("PayloadFalse"))
        assert isinstance(cmd, CommandSystemDonate)

        # Delivery of the decline record fails → silent, plain exhaustion
        with pytest.raises(StopIteration):
            advance_past_logs(gen, make_payload("PayloadResponse", success=False))


class TestSessionIdType:
    def test_session_id_accepts_string(self):
        flow = StubFlow(session_id="abc-123")
        assert flow.session_id == "abc-123"


class TestDonateKeyFormat:
    def test_donate_key_includes_platform(self):
        """Donate key should be '{session_id}-{platform_name.lower()}'."""
        flow = StubFlow(session_id="sess-42")
        gen = flow.start_flow()
        start_and_skip_logs(gen)  # file prompt
        advance_past_logs(gen, make_payload_file())  # consent form
        cmd = advance_past_logs(gen, make_payload("PayloadJSON", value="{}"))  # donate
        assert cmd.key == "sess-42-testplatform"


class TestUploadAdapterPassthrough:
    """Verify the adapter (file_result.value) is passed to validate/extract,
    not a path string. ADR-0026 streaming invariant.
    """

    def test_validate_file_receives_adapter(self):
        """validate_file is called with file_result.value, not a path."""
        flow = StubFlow()
        observed = []
        original_validate = flow.validate_file

        def spy_validate(file):
            observed.append(file)
            return original_validate(file)

        flow.validate_file = spy_validate

        gen = flow.start_flow()
        start_and_skip_logs(gen)
        adapter = MagicMock()
        adapter.size = 1024
        advance_past_logs(gen, make_payload("PayloadFile", value=adapter))

        assert observed == [adapter]

    def test_extract_data_receives_adapter(self):
        """extract_data is called with file_result.value, not a path."""
        flow = StubFlow()
        observed = []
        original_extract = flow.extract_data

        def spy_extract(file, validation):
            observed.append(file)
            return original_extract(file, validation)

        flow.extract_data = spy_extract

        gen = flow.start_flow()
        start_and_skip_logs(gen)
        adapter = MagicMock()
        adapter.size = 1024
        advance_past_logs(gen, make_payload("PayloadFile", value=adapter))

        assert observed == [adapter]


class MultiStubFlow(StubFlow):
    """Concrete FlowBuilder configured for a PayloadFiles (chunked-export) upload."""

    expected_file_payload = "PayloadFiles"


def make_payload_files(n=2):
    """Build a PayloadFiles-shaped payload with `n` valid, readable zip parts."""
    payload = MagicMock()
    payload.__type__ = "PayloadFiles"
    parts = []
    for i in range(n):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(f"Takeout/f{i}.json", "{}")
        buf.seek(0)
        buf.name = f"takeout-{i + 1}-001.zip"
        buf.size = 100
        parts.append(buf)
    payload.value = parts
    return payload


class TestMultiFileFlow:
    """PayloadFiles sets are unioned into one ArchiveSet before validate/extract."""

    def test_set_reaches_validate_and_extract_as_archive_set(self):
        flow = MultiStubFlow()
        observed = []
        original_validate = flow.validate_file

        def spy_validate(archive_set):
            observed.append(archive_set)
            return original_validate(archive_set)

        flow.validate_file = spy_validate

        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # Upload a two-part set → milestones → consent form (StubFlow's
        # validate_file stub always reports status 0)
        cmd = advance_past_logs(gen, make_payload_files(n=2))
        assert isinstance(cmd, CommandUIRender)

        assert len(observed) == 1
        assert isinstance(observed[0], ArchiveSet)
        assert observed[0].members == ["Takeout/f0.json", "Takeout/f1.json"]

    def test_single_payload_to_multi_flow_raises_upload_rejected(self):
        flow = MultiStubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # A singular PayloadFile arriving when this flow expects PayloadFiles
        # is a protocol mismatch, not a participant skip: a visible error
        # page, whose prompt came from ph.render_protocol_error_page.
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)
        assert cmd.page.header.title.translations["en"] == "Something went wrong"
        assert "out of sync" in cmd.page.body.text.translations["en"]

        # Acknowledging the error page is not a completion: nothing usable
        # was ever uploaded, so the run exits nonzero (ADR-0039).
        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 4

    def test_multi_payload_to_single_flow_raises_upload_rejected(self):
        flow = StubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # A PayloadFiles set arriving when this flow expects a singular
        # PayloadFile is the symmetric protocol mismatch — also a visible
        # error page, never a participant skip.
        cmd = advance_past_logs(gen, make_payload_files())
        assert isinstance(cmd, CommandUIRender)
        assert cmd.page.header.title.translations["en"] == "Something went wrong"
        assert "out of sync" in cmd.page.body.text.translations["en"]

        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 4

    def test_unknown_type_raises_upload_rejected(self):
        flow = StubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # An unrecognized __type__ is a protocol mismatch too, not a skip.
        cmd = advance_past_logs(gen, make_payload("PayloadBogus"))
        assert isinstance(cmd, CommandUIRender)
        assert cmd.page.header.title.translations["en"] == "Something went wrong"

        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 4

    def test_established_skips_still_raise_abandoned_for_multi_flow(self):
        flow = MultiStubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # PayloadFalse is still a silent skip, even for a flow that expects
        # PayloadFiles — the pinned skip set (PayloadFalse/PayloadVoid/
        # PayloadString) never routes to the protocol-error page. It is
        # still an abandonment, so it exits nonzero rather than completing.
        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadFalse"))
        assert exc.value.exit_code == 2

    def test_corrupt_part_retry_declined_raises_abandoned(self):
        flow = MultiStubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        good = make_payload_files(n=1).value[0]
        bad = io.BytesIO(b"not a zip file")
        bad.seek(0)
        bad.name = "takeout-2-001.zip"
        bad.size = len(b"not a zip file")

        # One good part + one unreadable part → ArchiveSet(...) raises
        # zipfile.BadZipFile → routed to the existing retry prompt, not a
        # traceback.
        cmd = advance_past_logs(gen, make_payload("PayloadFiles", value=[good, bad]))
        assert isinstance(cmd, CommandUIRender)
        assert cmd.page.header.title.translations["en"] == "Try again"

        # User declines the retry → abandonment, not a completion. Same
        # nonzero exit as declining retry after an invalid single file.
        with pytest.raises(TaskIncompleteError) as exc:
            advance_past_logs(gen, make_payload("PayloadFalse"))
        assert exc.value.exit_code == 2


class TestTooManyFilesSafetyPath:
    """A PayloadFiles set over uploads.MAX_UPLOAD_FILES hits the safety-error
    page — not an uncaught TooManyFilesError. Widens the flow_builder safety
    catch from FileTooLargeError alone to (FileTooLargeError, TooManyFilesError).
    """

    def test_too_many_files_shows_safety_error_page_then_raises_upload_rejected(self):
        flow = MultiStubFlow()
        gen = flow.start_flow()

        # File prompt
        cmd = start_and_skip_logs(gen)
        assert isinstance(cmd, CommandUIRender)

        # 17 files exceeds MAX_UPLOAD_FILES (16) → TooManyFilesError, caught
        # and rendered as the safety-error page.
        cmd = advance_past_logs(gen, make_payload_files(n=17))
        assert isinstance(cmd, CommandUIRender)
        assert cmd.page.header.title.translations["en"] == "File cannot be processed"

        # User acknowledges → upload-rejected exit, not a completion. The
        # count guard reaches the same terminal path as the size guard.
        with pytest.raises(TaskIncompleteError) as exc:
            gen.send(make_payload("PayloadTrue"))
        assert exc.value.exit_code == 4


class TestReviewPageReleasesTables:
    """While the consent page is shown, the flow must not keep the extracted
    tables alive: the donation comes back into Pyodide's never-shrinking
    memory and should be able to reuse their space."""

    def test_tables_are_freed_while_waiting_for_consent(self):
        import gc
        import weakref
        import pandas as pd

        refs = []

        class FreshTablesFlow(StubFlow):
            def extract_data(self, file, validation):
                df = pd.DataFrame({"col": [1, 2]})
                refs.append(weakref.ref(df))
                table = d3i_props.PropsUIPromptConsentFormTableViz(
                    id="t", data_frame=df, title=props.Translatable({"en": "T"}))
                return ExtractionResult(tables=[table], errors=Counter())

        gen = FreshTablesFlow(tables=[]).start_flow()
        start_and_skip_logs(gen)
        cmd = advance_past_logs(gen, make_payload_file())
        assert isinstance(cmd, CommandUIRender)
        assert refs[0]() is not None  # the yielded page still carries the table

        del cmd  # ScriptWrapper converts the command with toDict() and drops it
        gc.collect()
        assert refs[0]() is None

        cmd = advance_past_logs(gen, make_payload("PayloadJSON", value='{"data": "test"}'))
        assert isinstance(cmd, CommandSystemDonate)



class BytesProxy:
    """Stands in for the JsProxy of the Uint8Array the consent page donates: never a
    str, converted only through to_bytes()."""

    def __init__(self, data: bytes):
        self._data = data
        self.to_bytes_calls = 0

    def __len__(self):
        return len(self._data)

    def to_bytes(self):
        self.to_bytes_calls += 1
        return self._data

    def slice(self, start=0, end=None):
        """Uint8Array.prototype.slice: a new array, still never converted to Python."""
        return BytesProxy(self._data[start:end])


class TestBytesDonation:
    """The consent-viz page donates UTF-8 bytes (a JsProxy in Pyodide). The flow
    passes the object through untouched (ADR-0046): Pyodide converts a str both ways at
    a cost of hundreds of MB, and the bytes need no conversion at all."""

    def _reach_consent(self, flow):
        gen = flow.start_flow()
        assert isinstance(start_and_skip_logs(gen), CommandUIRender)
        assert isinstance(advance_past_logs(gen, make_payload_file()), CommandUIRender)
        return gen

    def test_plaintext_passes_the_bytes_object_through_untouched(self):
        flow = StubFlow()
        gen = self._reach_consent(flow)
        proxy = BytesProxy(b'{"data": "test"}')
        cmd = advance_past_logs(gen, make_payload("PayloadJSON", value=proxy))
        assert isinstance(cmd, CommandSystemDonate)
        # A JS-side copy goes out (the original stays for a retry); nothing is
        # converted to Python.
        assert isinstance(cmd.json_string, BytesProxy) and cmd.json_string is not proxy
        assert cmd.json_string._data == proxy._data
        assert proxy.to_bytes_calls == 0 and cmd.json_string.to_bytes_calls == 0


class TestOmittedDataDisclosure:
    """Eyra review R03: when some data could not be read, the participant is
    told on the review page before consenting."""

    def _review_page(self, errors):
        flow = StubFlow()
        flow.extract_data = lambda file, validation: ExtractionResult(tables=flow._tables, errors=errors)
        gen = flow.start_flow()
        start_and_skip_logs(gen)
        return advance_past_logs(gen, make_payload_file())

    def test_review_page_names_what_was_skipped(self):
        cmd = self._review_page(Counter({"SkippedMessage": 2}))
        notice = cmd.page.body.notice
        assert notice is not None and "• Messages: 2" in notice.translations["en"]

    def test_no_notice_when_nothing_was_skipped(self):
        cmd = self._review_page(Counter({"TimestampParseError": 1}))
        assert cmd.page.body.notice is None
