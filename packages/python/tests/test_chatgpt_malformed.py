"""Eyra review R03: one malformed message, conversation or file must not
empty the whole ChatGPT table. Missing text gives an empty message; anything
that can't be read is skipped on its own and counted, so the participant can
be told and the researcher receives the counts with the table.
"""
import io
import json
import zipfile
from collections import Counter

import port.helpers.port_helpers as ph
import port.helpers.validate as validate
from port.helpers.extraction_helpers import ZipArchiveReader
from port.platforms.chatgpt import DDP_CATEGORIES, conversations_to_df, message_text


def node(id, parent, role, content):
    return {
        "id": id,
        "parent": parent,
        "message": {"author": {"role": role}, "content": content, "create_time": 1783692498.9, "metadata": {}},
    }


def text(t):
    return {"content_type": "text", "parts": [t]}


def conversation(*nodes, title="Chat"):
    return {"title": title, "mapping": {n["id"]: n for n in nodes}}


def good_conversation(title="Good"):
    return conversation(node("q", None, "user", text("question")), node("a", "q", "assistant", text("answer")), title=title)


def extract(files: dict[str, bytes]):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, content in files.items():
            z.writestr(name, content)
    buf.seek(0)
    validation = validate.validate_zip(DDP_CATEGORIES, buf)
    errors: Counter = Counter()
    buf.seek(0)
    df = conversations_to_df(ZipArchiveReader(buf, validation.archive_members, errors), errors)
    return df, errors


def extract_conversations(conversations):
    return extract({"conversations.json": json.dumps(conversations).encode()})


def test_null_parts_gives_an_empty_message_not_a_failure():
    df, errors = extract_conversations([
        conversation(node("q", None, "user", {"content_type": "text", "parts": None})),
        good_conversation(),
    ])
    assert list(df["message"]) == ["", "question", "answer"]
    assert errors == Counter()


def test_null_reasoning_recap_content_gives_an_empty_message():
    df, errors = extract_conversations([
        conversation(node("r", None, "assistant", {"content_type": "reasoning_recap", "content": None})),
        good_conversation(),
    ])
    assert list(df["message"]) == ["", "question", "answer"]
    assert errors == Counter()


def test_mapping_entry_that_is_not_a_dict_skips_only_that_message():
    bad = good_conversation("Bad")
    bad["mapping"]["broken"] = "not a dict"
    df, errors = extract_conversations([bad, good_conversation()])
    assert len(df) == 4
    assert errors == Counter({ph.SKIPPED_MESSAGE: 1})


def test_message_that_fails_skips_only_that_message(monkeypatch):
    """Any unexpected failure while building one row costs only that row."""
    import port.platforms.chatgpt as chatgpt

    real_redact = chatgpt.redact.redact

    def failing_redact(value):
        if value == "boom":
            raise ValueError("unexpected")
        return real_redact(value)

    monkeypatch.setattr(chatgpt.redact, "redact", failing_redact)
    bad = good_conversation("Bad")
    bad["mapping"]["x"] = node("x", "a", "user", text("boom"))
    df, errors = extract_conversations([bad, good_conversation()])

    assert len(df) == 4 and "boom" not in set(df["message"])
    assert errors == Counter({ph.SKIPPED_MESSAGE: 1})


def test_conversation_without_mapping_is_skipped_and_counted():
    df, errors = extract_conversations([{"title": "no mapping"}, "not a conversation", good_conversation()])
    assert len(df) == 2
    assert errors == Counter({ph.SKIPPED_CONVERSATION: 2})


def test_unreadable_part_is_skipped_and_counted_other_parts_kept():
    df, errors = extract({
        "conversations-000.json": json.dumps([good_conversation("A")]).encode(),
        "conversations-001.json": b'[{"title": "truncated", "mapping": {',
    })
    assert set(df["conversation title"]) == {"A"}
    assert errors[ph.SKIPPED_FILE] == 1


def test_message_text_never_raises_and_always_returns_strings():
    weird = [
        None, "x", {}, {"content_type": None},
        {"content_type": "text", "parts": "plain"},
        {"content_type": "text", "parts": [None, 1, "a", {"b": 1}]},
        {"content_type": "multimodal_text", "parts": None},
        {"content_type": "multimodal_text", "parts": ["a", {"text": "b"}, {"text": None}, 3]},
        {"content_type": "thoughts", "thoughts": None},
        {"content_type": "thoughts", "thoughts": ["s", {"summary": "ok"}, {"summary": None}]},
        {"content_type": "reasoning_recap", "content": ["a"]},
        {"content_type": "something_new"},
    ]
    for content in weird:
        content_type, value = message_text(content)
        assert isinstance(content_type, str) and isinstance(value, str)
    assert message_text({"content_type": "multimodal_text", "parts": ["a", {"text": "b"}]}) == ("multimodal_text", "a b")
    assert message_text({"content_type": "thoughts", "thoughts": [{"summary": "ok"}]}) == ("thoughts", "ok")
    assert message_text({"content_type": "something_new"}) == ("something_new", "[Unhandled content type: something_new]")


def test_omitted_data_notice_lists_only_skipped_data():
    assert ph.omitted_data_notice(Counter({"TimestampParseError": 4})) is None
    notice = ph.omitted_data_notice(Counter({ph.SKIPPED_MESSAGE: 3, ph.SKIPPED_FILE: 1, "TimestampParseError": 4}))
    assert notice is not None
    en = notice.translations["en"]
    assert "• Messages: 3" in en and "• Files or file parts: 1" in en
    assert "Conversations" not in en and "Timestamp" not in en
    assert "• Berichten: 3" in notice.translations["nl"]


# Eyra review R05: an unreadable creation time leaves "time" empty and keeps
# the original value in "unreadable time"; readable and absent times leave
# "unreadable time" empty.
def _with_time(id, create_time):
    n = node(id, None, "user", text(id))
    n["message"]["create_time"] = create_time
    return n


def test_unreadable_time_is_kept_apart_from_the_time_column():
    df, errors = extract_conversations([conversation(
        _with_time("ok", 1783692498.9),
        _with_time("millis", 1783692498900000),
        _with_time("text", "yesterday"),
        _with_time("none", None),
    )])
    rows = df.set_index("message id")
    assert rows.loc["ok", "time"].startswith("2026-") and rows.loc["ok", "unreadable time"] == ""
    assert rows.loc["millis", "time"] == "" and rows.loc["millis", "unreadable time"] == "1783692498900000"
    assert rows.loc["text", "time"] == "" and rows.loc["text", "unreadable time"] == "yesterday"
    assert rows.loc["none", "time"] == "" and rows.loc["none", "unreadable time"] == ""
    assert errors == Counter({"TimestampParseError": 2})


def test_epoch_to_iso_keeps_its_default_for_other_platforms():
    from port.helpers.extraction_helpers import epoch_to_iso
    assert epoch_to_iso("yesterday") == "yesterday"
    assert epoch_to_iso("yesterday", keep_invalid=False) == ""
