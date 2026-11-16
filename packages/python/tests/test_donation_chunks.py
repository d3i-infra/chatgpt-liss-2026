"""ADR-0047: the reviewed data is sent in parts of at most DONATE_PART_BYTES,
each under its own key, with a progress page per part.
Concatenated in part order the parts are exactly the donation."""
from types import SimpleNamespace
from unittest.mock import patch

import pytest

import port.helpers.port_helpers as ph
from port.api.commands import CommandSystemDonate, CommandUIRender
from tests.test_flow_builder import StubFlow, advance_past_logs, make_payload, make_payload_file, start_and_skip_logs


class Uint8ArrayProxy:
    """Stands in for the JsProxy of the page's Uint8Array: len, indexing, slice."""

    def __init__(self, data: bytes):
        self._data = data
        self.slices = []

    def __len__(self):
        return len(self._data)

    def __getitem__(self, i):
        return self._data[i]

    def slice(self, start, end):
        self.slices.append((start, end))
        return self._data[start:end]


DATA = ('{"t": "' + "é€😀abc" * 4000 + '"}').encode("utf-8")


@pytest.mark.parametrize("size", [7, 64, 1000, 4096])
def test_parts_never_split_a_character_and_concatenate_to_the_donation(size):
    bounds = ph.donation_chunk_bounds(DATA, size)
    parts = [DATA[a:b] for a, b in bounds]
    assert b"".join(parts) == DATA
    assert all(len(p) <= size for p in parts)
    assert all(p.decode("utf-8") for p in parts)  # each part decodes on its own


def test_small_donation_is_one_part():
    assert ph.donation_chunk_bounds(b"{}", 10) == [(0, 2)]


def test_page_bytes_are_sliced_into_standalone_arrays():
    proxy = Uint8ArrayProxy(DATA)
    bounds = ph.donation_chunk_bounds(proxy, 1000)
    parts = [ph.donation_chunk(proxy, a, b) for a, b in bounds]
    assert b"".join(parts) == DATA
    assert proxy.slices == bounds


def test_part_keys_keep_the_platform_after_the_last_hyphen():
    assert ph.donation_part_key("sess-1-chatgpt", 1, 1) == "sess-1-chatgpt"
    key = ph.donation_part_key("sess-1-chatgpt", 2, 7)
    assert key == "sess-1-chatgpt_part2of7"
    assert key.rsplit("-", 1)[1].startswith("chatgpt")


def _to_donation(chunk_bytes, data):
    with patch.object(ph, "DONATION_CHUNK_BYTES", chunk_bytes):
        gen = StubFlow().start_flow()
        start_and_skip_logs(gen)
        advance_past_logs(gen, make_payload_file())
        # Collect what the flow yields after consent, answering every command.
        out = []
        cmd = gen.send(make_payload("PayloadJSON", value=Uint8ArrayProxy(data)))
        try:
            while True:
                out.append(cmd)
                if isinstance(cmd, CommandSystemDonate):
                    cmd = gen.send(make_payload("PayloadResponse", value=SimpleNamespace(success=True, key=cmd.key, status=200)))
                else:
                    cmd = gen.send(make_payload("PayloadVoid"))
        except StopIteration:
            pass
        return out


def test_flow_sends_each_part_after_its_progress_page():
    with patch.object(ph, "DONATION_CHUNK_BYTES", 5000):
        bounds = ph.donation_chunk_bounds(DATA, 5000)
    out = _to_donation(5000, DATA)
    donations = [c for c in out if isinstance(c, CommandSystemDonate)]
    pages = [c.toDict()["page"]["body"][0] for c in out if isinstance(c, CommandUIRender)]
    total = len(bounds)
    assert total > 1
    assert [d.key for d in donations] == [f"test-session-testplatform_part{i}of{total}" for i in range(1, total + 1)]
    assert b"".join(d.json_string for d in donations) == DATA
    assert [p["__type__"] for p in pages] == ["PropsUIPromptProgress"] * total
    assert f"part 2 of {total}" in pages[1]["text"]["translations"]["en"]


class Part:
    """Stands in for one of the page's Uint8Array parts (a JsProxy)."""

    def __init__(self, data: bytes):
        self.data = data
        self.copies = 0

    def __len__(self):
        return len(self.data)

    def slice(self):
        self.copies += 1
        return self.data


def ok(cmd):
    return make_payload("PayloadResponse", value=SimpleNamespace(success=True, key=cmd.key, status=200))


def failed(cmd, status=0):
    return make_payload("PayloadResponse", value=SimpleNamespace(success=False, key=cmd.key, status=status, error="x"))


def _consented(parts):
    gen = StubFlow().start_flow()
    start_and_skip_logs(gen)
    advance_past_logs(gen, make_payload_file())
    return gen, advance_past_logs(gen, make_payload("PayloadJSON", value=parts))


def test_page_parts_are_sent_as_copies_and_released_once_delivered():
    parts = [Part(b'[{"a":'), Part(b'"\xc3\xa9"'), Part(b"}]")]
    originals = list(parts)
    gen, cmd = _consented(parts)
    keys, data, held = [], [], []
    try:
        while True:
            assert isinstance(cmd, CommandSystemDonate)
            keys.append(cmd.key)
            data.append(cmd.json_string)
            held.append([p is not None for p in parts])
            cmd = advance_past_logs(gen, ok(cmd))
    except StopIteration:
        pass
    assert keys == [f"test-session-testplatform_part{i}of3" for i in (1, 2, 3)]
    assert b"".join(data) == b'[{"a":"\xc3\xa9"}]'
    # A part is held until it is delivered, then released.
    assert held == [[True, True, True], [False, True, True], [False, False, True]]
    assert parts == [None, None, None]
    assert [p.copies for p in originals] == [1, 1, 1]


def test_a_failed_part_is_retried_once_automatically_then_offered_again():
    parts = [Part(b"[1,"), Part(b"2]")]
    second = parts[1]
    gen, cmd = _consented(parts)
    cmd = advance_past_logs(gen, ok(cmd))                       # part 1 delivered
    assert cmd.key.endswith("_part2of2")
    cmd = advance_past_logs(gen, failed(cmd))                   # automatic retry
    assert isinstance(cmd, CommandSystemDonate) and cmd.key.endswith("_part2of2")
    cmd = advance_past_logs(gen, failed(cmd, 429))              # participant is asked
    assert isinstance(cmd, CommandUIRender)
    page = str(cmd.toDict())
    assert "Part 2 of 2 could not be sent" in page and "Try again" in page
    cmd = advance_past_logs(gen, make_payload("PayloadTrue"))   # try again: same part
    assert isinstance(cmd, CommandSystemDonate) and cmd.key.endswith("_part2of2")
    assert cmd.json_string == b"2]"
    with pytest.raises(StopIteration):
        advance_past_logs(gen, ok(cmd))                         # delivered: flow completes
    assert second.copies == 3  # first try, automatic retry, participant retry


def test_stopping_after_a_failed_part_ends_incomplete():
    from port.helpers.flow_builder import TaskIncompleteError

    gen, cmd = _consented([Part(b"[1,"), Part(b"2]")])
    cmd = advance_past_logs(gen, failed(cmd))
    cmd = advance_past_logs(gen, failed(cmd))
    cmd = advance_past_logs(gen, make_payload("PayloadFalse"))  # stop
    assert "could not be submitted" in str(cmd.toDict())
    with pytest.raises(TaskIncompleteError):
        gen.send(make_payload("PayloadTrue"))
