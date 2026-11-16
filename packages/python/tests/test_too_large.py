"""Eyra review R01: running out of memory is "too large", not a bug and not a
damaged file. The participant can choose a file again or stop; nothing is
reported, and stopping exits with the upload-rejected code (ADR-0039)."""
import json
from collections import Counter

from port.api.commands import CommandSystemLog
from port.api.d3i_props import ExtractionResult
from port.main import ScriptWrapper
from tests.test_flow_builder import StubFlow, advance_past_logs, make_payload, make_payload_file, start_and_skip_logs
from tests.test_main_queue import _Payload


class HugePage:
    """A command whose conversion to the page runs out of memory (main.py)."""

    def toDict(self):
        raise MemoryError()


def test_memory_error_while_reading_shows_the_too_large_page():
    def script():
        _ = yield CommandSystemLog(level="info", message="start")
        raise MemoryError()

    wrapper = ScriptWrapper(script(), platform="ChatGPT")
    wrapper.send(None)
    page = json.dumps(wrapper.send(None))
    assert "too large to process in this browser" in page
    assert "PropsUIPromptTechnicalDetails" not in page  # no error report for a memory limit


def test_memory_error_building_the_review_page_shows_the_too_large_page():
    closed = []

    def script():
        try:
            _ = yield CommandSystemLog(level="info", message="start")
            _ = yield HugePage()
        finally:
            closed.append(True)

    wrapper = ScriptWrapper(script(), platform="ChatGPT")
    wrapper.send(None)
    page = json.dumps(wrapper.send(None))
    assert "too large to process in this browser" in page
    assert closed == [True]  # the suspended script (and its tables) are released


def test_choose_again_restarts_and_stop_exits_upload_rejected():
    def huge():
        _ = yield CommandSystemLog(level="info", message="start")
        raise MemoryError()

    def fresh():
        yield CommandSystemLog(level="info", message="fresh start")

    wrapper = ScriptWrapper(huge(), platform="ChatGPT", restart=fresh)
    wrapper.send(None)
    wrapper.send(None)  # too-large page
    assert wrapper.send(_Payload("PayloadTrue"))["message"] == "fresh start"

    wrapper = ScriptWrapper(huge(), platform="ChatGPT", restart=fresh)
    wrapper.send(None)
    wrapper.send(None)
    incomplete = wrapper.send(_Payload("PayloadFalse"))
    assert "could not be completed" in json.dumps(incomplete)
    done = wrapper.send(_Payload("PayloadTrue"))
    assert (done["__type__"], done["code"], done["info"]) == ("CommandSystemExit", 4, "Upload rejected")


def test_parts_unreadable_for_memory_say_too_large_not_damaged():
    flow = StubFlow()
    flow.extract_data = lambda file, validation: ExtractionResult(tables=[], errors=Counter({"MemoryError": 2, "SkippedFile": 2}))
    gen = flow.start_flow()
    start_and_skip_logs(gen)
    page = json.dumps(advance_past_logs(gen, make_payload_file()).toDict())
    assert "too large to process" in page and "damaged" not in page


def test_reading_a_part_that_runs_out_of_memory_is_counted_by_name(monkeypatch):
    import port.helpers.extraction_helpers as eh

    def out_of_memory(raw, encoding):
        raise MemoryError()

    errors = Counter()
    assert eh._read_json(b"[]", out_of_memory, errors=errors) == {}
    assert errors == Counter({"MemoryError": 1})
