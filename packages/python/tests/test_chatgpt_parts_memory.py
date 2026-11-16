"""Eyra review R01: a large ChatGPT export is split over conversations parts.
The extractor reads them one at a time, so its peak memory is set by the
extracted rows plus one parsed part, not by every parsed part at once.
"""
import io
import json
import tracemalloc
import zipfile
from collections import Counter

import port.helpers.validate as validate
from port.helpers.extraction_helpers import ZipArchiveReader
from port.platforms.chatgpt import DDP_CATEGORIES, conversations_to_df

PARTS = 8
CONVERSATIONS_PER_PART = 60


def conversation(n: int) -> dict:
    # Like a real export, most of the bytes are structure and metadata that
    # never reach the table; the message text itself is short.
    metadata = {f"key_{k}": {"nested": [k, k + 1, {"flag": True}]} for k in range(25)}
    mapping = {}
    parent = None
    for m in range(6):
        node_id = f"c{n}-m{m}"
        mapping[node_id] = {
            "id": node_id,
            "parent": parent,
            "children": [],
            "message": {
                "id": node_id,
                "author": {"role": "user" if m % 2 == 0 else "assistant", "metadata": {}},
                "content": {"content_type": "text", "parts": [f"message {m} of {n}"]},
                "create_time": 1783692498.9 + m,
                "metadata": metadata,
            },
        }
        parent = node_id
    return {"title": f"Chat {n}", "mapping": mapping}


def make_archive() -> tuple[io.BytesIO, list[str]]:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in range(PARTS):
            part = [conversation(p * CONVERSATIONS_PER_PART + i) for i in range(CONVERSATIONS_PER_PART)]
            z.writestr(f"conversations-{p:03d}.json", json.dumps(part))
    buf.seek(0)
    members = validate.validate_zip(DDP_CATEGORIES, buf).archive_members
    buf.seek(0)
    return buf, members


def peak(fn) -> int:
    tracemalloc.start()
    try:
        fn()
        return tracemalloc.get_traced_memory()[1]
    finally:
        tracemalloc.stop()


def test_parts_are_read_one_at_a_time():
    buf, members = make_archive()

    def all_parts_at_once():
        results = ZipArchiveReader(buf, members, Counter()).json_all(r"^conversations.*\.json")
        assert len(results) == PARTS

    def extract():
        errors: Counter = Counter()
        df = conversations_to_df(ZipArchiveReader(buf, members, errors), errors)
        assert len(df) == PARTS * CONVERSATIONS_PER_PART * 6
        assert errors == Counter()

    holding_all = peak(all_parts_at_once)
    buf.seek(0)
    streaming = peak(extract)
    # Holding every parsed part is what the extractor used to do before
    # building the table; reading part by part must stay well below that.
    assert streaming < holding_all / 2, (streaming, holding_all)


def test_json_each_yields_parts_in_member_order():
    buf, members = make_archive()
    reader = ZipArchiveReader(buf, members, Counter())
    paths = [r.member_path for r in reader.json_each(r"^conversations.*\.json")]
    assert paths == [f"conversations-{p:03d}.json" for p in range(PARTS)]
