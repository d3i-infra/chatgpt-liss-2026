"""Tests for the ChatGPT extractor's ``hidden`` column: which messages ChatGPT
doesn't show because they sit on another branch than the one ending at the
conversation's ``current_node``.
"""
import json
import zipfile
from collections import Counter

import port.helpers.validate as validate
from port.helpers.extraction_helpers import ZipArchiveReader
from port.platforms.chatgpt import DDP_CATEGORIES, conversations_to_df, shown_message_ids


def node(id, parent, role, text, time):
    return {
        "id": id,
        "parent": parent,
        "message": {
            "author": {"role": role},
            "content": {"content_type": "text", "parts": [text]},
            "create_time": time,
            "metadata": {},
        },
    }


def conversation(current_node="a2"):
    """q1 has two replies created in the same second: a1 (continued on, shown)
    and b1 (the one not picked, hidden)."""
    nodes = [
        node("q1", None, "user", "question", 1783692498.9),
        node("b1", "q1", "assistant", "hidden reply", 1783692503.5),
        node("a1", "q1", "assistant", "shown reply", 1783692503.8),
        node("q2", "a1", "user", "follow-up", 1783692600.0),
        node("a2", "q2", "assistant", "answer", 1783692605.0),
    ]
    conv = {"title": "Chat", "mapping": {n["id"]: n for n in nodes}}
    if current_node is not None:
        conv["current_node"] = current_node
    return conv


def extract(tmp_path, conversations):
    path = tmp_path / "chatgpt.zip"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("conversations.json", json.dumps(conversations))
    validation = validate.validate_zip(DDP_CATEGORIES, str(path))
    return conversations_to_df(ZipArchiveReader(str(path), validation.archive_members, Counter()), Counter())


def test_shown_path_runs_from_current_node_to_the_root():
    assert shown_message_ids(conversation()) == {"q1", "a1", "q2", "a2"}


def test_unknown_current_node_gives_no_shown_path():
    assert shown_message_ids(conversation(current_node=None)) is None
    assert shown_message_ids(conversation(current_node="missing")) is None


def test_cyclic_parents_end_the_walk():
    conv = conversation()
    conv["mapping"]["q1"]["parent"] = "a2"
    assert shown_message_ids(conv) == {"q1", "a1", "q2", "a2"}


def test_hidden_column_marks_messages_off_the_shown_path(tmp_path):
    df = extract(tmp_path, [conversation()])
    hidden = dict(zip(df["message id"], df["hidden"]))
    assert hidden == {"q1": False, "b1": True, "a1": False, "q2": False, "a2": False}


def test_nothing_hidden_without_current_node(tmp_path):
    df = extract(tmp_path, [conversation(current_node=None)])
    assert not df["hidden"].any()
