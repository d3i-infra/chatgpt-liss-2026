"""ADR-0048: an export larger than the donation budget keeps its most recent
conversations, whatever the order of the export parts, and says what was left out."""
import io
import json
import random
import zipfile
from collections import Counter
from types import SimpleNamespace
from unittest.mock import patch

import port.helpers.port_helpers as ph
import port.helpers.size_cap as size_cap
import port.helpers.validate as validate
from port.helpers.extraction_helpers import ZipArchiveReader
from port.helpers.size_cap import RecentFirstSelection, row_bytes
from port.platforms.chatgpt import DDP_CATEGORIES, conversations_to_df


def rows(day: int, n: int = 1, size: int = 10) -> list[dict]:
    return [{"time": f"2025-03-{day:02d}T10:00:00+00:00", "message": "x" * size} for _ in range(n)]


def bytes_of(*conversations) -> int:
    return sum(row_bytes(r) for c in conversations for r in c)


class TestRecentFirstSelection:
    def test_everything_fits(self):
        s = RecentFirstSelection(10_000)
        for day in (3, 1, 2):
            s.offer(rows(day))
        assert s.kept == 3 and s.left_out == 0
        assert [r["time"][:10] for r in s.rows()] == ["2025-03-03", "2025-03-01", "2025-03-02"]  # read order
        errors = Counter()
        s.count_into(errors)
        assert errors == Counter()

    def test_keeps_the_newest_whatever_the_arrival_order(self):
        convs = {day: rows(day) for day in range(1, 11)}
        budget = bytes_of(*[convs[d] for d in (8, 9, 10)])
        order = list(convs)
        random.Random(4).shuffle(order)
        s = RecentFirstSelection(budget)
        for day in order:
            s.offer(convs[day])
        assert sorted(r["time"][:10] for r in s.rows()) == ["2025-03-08", "2025-03-09", "2025-03-10"]
        assert s.left_out == 7

    def test_a_small_older_conversation_never_fills_a_gap(self):
        # Day 5 is big and does not fit next to day 6; day 1 is small and would,
        # but keeping it would break "everything after a date".
        s = RecentFirstSelection(bytes_of(rows(6), rows(1)))
        s.offer(rows(6))
        s.offer(rows(5, size=500))
        s.offer(rows(1))
        assert [r["time"][:10] for r in s.rows()] == ["2025-03-06"]
        assert s.left_out == 2

    def test_conversations_without_a_time_count_as_oldest(self):
        s = RecentFirstSelection(bytes_of(rows(2)))
        s.offer([{"time": "", "message": "x" * 10}])
        s.offer(rows(2))
        assert [r["time"] for r in s.rows()] == [rows(2)[0]["time"]]

    def test_counts_are_donated_when_something_is_left_out(self):
        s = RecentFirstSelection(bytes_of(rows(9), rows(7)))
        for day in (7, 9, 4):
            s.offer(rows(day))
        errors = Counter()
        s.count_into(errors)
        assert errors[ph.SIZE_CAP_LEFT_OUT] == 1
        assert errors[ph.SIZE_CAP_INCLUDED] == 2
        assert errors[ph.SIZE_CAP_INCLUDED_FROM] == 20250307
        assert errors[ph.SIZE_CAP_BUDGET_MB] == 0  # tiny test budget


def test_row_size_matches_the_page_json():
    row = {"message": "héllo 😀 \"q\"", "hidden": False, "n": 3}
    assert row_bytes(row) == len(json.dumps(row, ensure_ascii=False, separators=(",", ":")).encode()) + 1


def test_budget_is_lower_only_for_reported_low_memory():
    assert size_cap.donation_budget_bytes(16) == size_cap.BUDGET_BYTES
    assert size_cap.donation_budget_bytes(8) == size_cap.BUDGET_BYTES
    assert size_cap.donation_budget_bytes(4) == size_cap.LOW_MEMORY_BUDGET_BYTES


def node(id, parent, role, text, t):
    return {"id": id, "parent": parent, "message": {
        "author": {"role": role}, "content": {"content_type": "text", "parts": [text]},
        "create_time": t, "metadata": {}}}


def conversation(day: int) -> dict:
    t = 1740823200 + day * 86400  # 2025-03-01 10:00 UTC + day
    return {"title": f"Day {day}", "mapping": {
        "q": node("q", None, "user", "question " * 20, t),
        "a": node("a", "q", "assistant", "answer " * 20, t + 60)}}


def extract(parts: dict[str, list]):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, convs in parts.items():
            z.writestr(name, json.dumps(convs))
    buf.seek(0)
    members = validate.validate_zip(DDP_CATEGORIES, buf).archive_members
    buf.seek(0)
    errors: Counter = Counter()
    return conversations_to_df(ZipArchiveReader(buf, members, errors), errors), errors


def test_chatgpt_export_over_budget_keeps_the_most_recent_conversations():
    # Parts deliberately out of date order, as exports can be.
    parts = {
        "conversations-000.json": [conversation(d) for d in (5, 1, 9)],
        "conversations-001.json": [conversation(d) for d in (12, 3)],
        "conversations-002.json": [conversation(d) for d in (7, 10, 2)],
    }
    full, _ = extract(parts)
    per_conversation = full.groupby("conversation title").apply(
        lambda g: sum(row_bytes(r) for r in g.to_dict("records"))).max()
    with patch.object(size_cap, "BUDGET_BYTES", int(per_conversation * 3.5)):
        df, errors = extract(parts)
    assert sorted(set(df["conversation title"])) == ["Day 10", "Day 12", "Day 9"]
    assert errors[ph.SIZE_CAP_LEFT_OUT] == 5 and errors[ph.SIZE_CAP_INCLUDED] == 3
    assert errors[ph.SIZE_CAP_INCLUDED_FROM] == 20250310

    notice = ph.review_notice(errors).toDict()["translations"]
    assert "3 most recent conversations" in notice["en"] and "March 10, 2025" in notice["en"]
    assert "5 older conversations are left out" in notice["en"]
    assert "10 maart 2025" in notice["nl"]


def test_review_notice_lists_size_and_unreadable_items_together():
    errors = Counter({ph.SIZE_CAP_LEFT_OUT: 4, ph.SIZE_CAP_INCLUDED: 10, ph.SKIPPED_MESSAGE: 2})
    text = ph.review_notice(errors).toDict()["translations"]["en"]
    assert text.index("too large") < text.index("could not be read")
    assert ph.review_notice(Counter()) is None


def test_size_estimate_is_close_to_the_donated_json():
    parts = {"conversations-000.json": [conversation(d) for d in range(1, 30)]}
    df, _ = extract(parts)
    exact = sum(row_bytes(r) for r in df.to_dict("records"))
    estimate = size_cap.estimated_donation_bytes([SimpleNamespace(data_frame=df)])
    assert 0.8 * exact < estimate < 1.2 * exact


class TestCloseTabsAdvice:
    """Shown only when the donation is at least half the budget (ADR-0048)."""

    def _review_notice(self, budget):
        from tests.test_flow_builder import StubFlow, advance_past_logs, make_payload_file, start_and_skip_logs

        with patch.object(size_cap, "BUDGET_BYTES", budget):
            gen = StubFlow().start_flow()
            start_and_skip_logs(gen)
            cmd = advance_past_logs(gen, make_payload_file())
        body = cmd.toDict()["page"]["body"]
        return str(body[0].get("notice") if isinstance(body, list) else body.get("notice"))

    def test_small_donation_gets_no_advice(self):
        assert "close other browser tabs" not in self._review_notice(10**9)

    def test_large_donation_is_asked_to_close_other_tabs(self):
        assert "close other browser tabs" in self._review_notice(1)
