"""
ChatGPT

This module provides an example flow of a ChatGPT data donation study

Assumptions:
It handles DDPs in the english language with filetype JSON.

Configuration
-------------
The ``extraction`` function is driven by ``port_config.json``.  Generate one with::

    pnpm generate-config chatgpt

Each extractor function carries its own table config in a ``Table config::``
JSON block inside its docstring.  The generator reads those blocks and
assembles the JSON file.

Platform info::

    {
        "name": "ChatGPT",
        "filetypes": ["json"],
        "languages": ["en", "nl"],
        "description": "Handles DDPs in English. These data donation flows have not been tested yet, if you find anything wrong with them report to datadonation@uu.nl and they will be fixed!",
        "time_last_tested": "not yet implemented"
    }
"""
import logging
from collections import Counter
from typing import Callable

import pandas as pd

import port.helpers.extraction_helpers as eh
import port.helpers.validate as validate
from port.helpers.extraction_helpers import ZipArchiveReader
from port.helpers.flow_builder import FlowBuilder

from port.helpers.validate import (
    DDPCategory,
    DDPFiletype,
    Language,
)
from port.api.d3i_props import ExtractionResult
from port.api.file_utils import SeekableBinaryReader
from port.helpers.table_extractor import (
    load_port_config,
    run_extraction,
)
import port.helpers.redact as redact
import port.helpers.port_helpers as ph
import port.helpers.size_cap as size_cap

logger = logging.getLogger(__name__)

DDP_CATEGORIES = [
    DDPCategory(
        id="json",
        ddp_filetype=DDPFiletype.JSON,
        language=Language.EN,
        known_files=[
            "chat.html",
            "conversations.json",
            "conversations-000.json",
            "message_feedback.json",
            "model_comparisons.json",
            "user.json"
        ]
    )
]


def shown_message_ids(conversation: dict) -> set[str] | None:
    """Return the ids of the messages ChatGPT shows in a conversation.

    A conversation is a tree: regenerating a reply, editing a prompt or
    picking one of two compared replies adds a sibling branch under the same
    parent. ChatGPT shows only the path from ``current_node`` back to the
    root; every message off that path is hidden from the conversation.

    Returns None when that path can't be determined (no or unknown
    ``current_node``), so callers don't mark anything as hidden.
    """
    mapping = conversation["mapping"]
    node_id = conversation.get("current_node")
    if not isinstance(node_id, str) or node_id not in mapping:
        return None

    shown: set[str] = set()
    # The shown check guards against a cyclic parent chain in malformed data.
    while isinstance(node_id, str) and node_id in mapping and node_id not in shown:
        shown.add(node_id)
        node = mapping[node_id]
        node_id = node.get("parent") if isinstance(node, dict) else None
    return shown


def conversations_to_df(reader: ZipArchiveReader, errors: Counter) -> pd.DataFrame:
    """Extract all ChatGPT conversations into a DataFrame.

    Parameters
    ----------
    reader:
        Archive reader used to load JSON files from the DDP zip.
    errors:
        Mutable counter that accumulates error type counts encountered during
        extraction.  Updated in-place.

    Returns
    -------
    pd.DataFrame
        Columns: ``conversation title``, ``role``, ``message``, ``content type``, ``model``, ``time``, ``unreadable time``, ``message id``, ``reaction to``, ``hidden``, ``content references``, ``search_result_groups``.
        Empty DataFrame when the file is absent or parsing fails.

    Table documentation::

        {
          "summary": "Each row represents one message turn in a ChatGPT conversation, including the role (user or assistant), the message text, the model used, and the timestamp.",
          "source_file": "conversations files (conversations-000.json, conversations-001.json, ... or conversations.json)",
          "columns": {
            "conversation title": "Title of the conversation as stored in the export.",
            "role": "Role of the message author: 'user' or 'assistant'.",
            "message": "Full text of the message.",
            "content type": "The content type of the message, e.g. 'text', 'multimodal_text', 'thoughts', or 'reasoning_recap'.",
            "model": "ChatGPT model slug used to generate the assistant reply.",
            "time": "ISO 8601 timestamp of when the message was created. Empty when the export has no time, or when its value could not be read as a time (see unreadable time).",
            "unreadable time": "The original creation-time value from the export when it could not be read as a time; empty otherwise. Rows with a value here have an empty time.",
            "message id": "A unique identifier for the message.",
            "reaction to": "The id of the message this message reacts to. ``client-created-root`` indicates the first message in the chat.",
            "hidden": "True when ChatGPT doesn't show the message in the conversation: it is on another branch than the one currently shown, e.g. an earlier version of a regenerated reply, a reply to an edited prompt, or the reply not picked when two were compared. False when shown, or when the export doesn't say which branch is shown.",
            "content references": "Contains content items that are referenced in the message.",
            "search_result_groups": "Contains the web search result groups (sources) used to ground the message, if any."
          }
        }

    Table config::

        {
          "id": "chatgpt_conversations",
          "show_grid": false,
          "title": {
            "en": "Your conversations",
            "nl": "Je gesprekken"
          },
          "description": {
            "en": "Below you find your conversations with ChatGPT. You can review the content of a conversation by clicking or tapping on it. You can also search through the conversations by typing in the search box. See the help buttons for further explanation.",
            "nl": "Hieronder vind je jouw gesprekken met ChatGPT. Je kunt de inhoud van een gesprek bekijken door erop te klikken of te tikken. Je kunt ook door de gesprekken zoeken door iets in het zoekvak te typen. Zie de helpknoppen voor meer uitleg."
          },
          "headers": {
            "conversation title": {"en": "Conversation title", "nl": "Gesprektitel"},
            "role": {"en": "Role", "nl": "Rol"},
            "message": {"en": "Message", "nl": "Bericht"},
            "content type": {"en": "Content type", "nl": "Inhoudstype"},
            "model": {"en": "Model", "nl": "Model"},
            "time": {"en": "Time", "nl": "Tijd"},
            "unreadable time": {"en": "Unreadable time", "nl": "Onleesbare tijd"},
            "message id": {"en": "ID", "nl": "ID"},
            "reaction to": {"en": "Reaction to", "nl": "Reactie op"},
            "hidden": {"en": "Hidden", "nl": "Verborgen"},
            "content references": {"en": "Content references", "nl": "Content referenties"},
            "search_result_groups": {"en": "Search result groups", "nl": "Zoekresultaatgroepen"}
          },
          "visualizations": [
            {
              "title": {
                "en": "Your conversations",
                "nl": "Je gesprekken"
              },
              "type": "chat_conversation",
              "roleColumn": "role",
              "messageColumn": "message",
              "modelColumn": "model",
              "timestampColumn": "time",
              "unreadableTimestampColumn": "unreadable time",
              "titleColumn": "conversation title",
              "referencesColumn": "content references",
              "sourcesColumn": "search_result_groups",
              "idColumn": "message id",
              "reactionToColumn": "reaction to",
              "hiddenColumn": "hidden",
              "contentTypeColumn": "content type",
              "height": 500
            }
          ]
        }
    """
    # One part at a time: each parsed part is dropped as soon as its rows are
    # taken, so Python holds the rows plus a single part rather than every
    # parsed part of a large export at once (Eyra review R01).
    #
    # Problems are handled at the smallest level that contains them, so one
    # malformed item never costs the participant the rest of their data
    # (Eyra review R03). Each skip is counted under a SKIPPED_* key: the
    # participant is told before review, and the counts are donated with the
    # table (see FlowBuilder and run_extraction).
    # Only the most recent conversations that fit the donation budget are kept
    # (ADR-0048); what is left out is counted and shown to the participant.
    selection = size_cap.RecentFirstSelection(size_cap.donation_budget_bytes())
    for result in reader.json_each(r"^conversations.*\.json"):
        part = result.data
        del result
        if not isinstance(part, list):
            # Unreadable part (invalid JSON, read failure) or not a
            # conversations list at all.
            errors[SKIPPED_FILE] += 1
            del part
            continue
        _add_part_rows(part, selection, errors)
        del part  # release this part before the next is parsed

    selection.count_into(errors)
    datapoints = selection.rows()
    del selection
    if not datapoints:
        return pd.DataFrame()
    return pd.DataFrame(datapoints)


def _add_part_rows(part: list, selection: "size_cap.RecentFirstSelection", errors: Counter) -> None:
    """Offer the rows of every readable conversation in one conversations part."""
    for conversation in part:
        try:
            selection.offer(conversation_rows(conversation, errors))
        except Exception as e:
            logger.error("Skipped a conversation: %s", type(e).__name__)
            errors[SKIPPED_CONVERSATION] += 1


#: Error-counter keys for data left out because it could not be read. Kept in
#: port_helpers so FlowBuilder can name them in the participant notice.
SKIPPED_FILE = ph.SKIPPED_FILE
SKIPPED_CONVERSATION = ph.SKIPPED_CONVERSATION
SKIPPED_MESSAGE = ph.SKIPPED_MESSAGE


def conversation_rows(conversation, errors: Counter) -> list[dict]:
    """Rows for every message in one conversation.

    A conversation without a ``mapping`` dict is skipped and counted; a
    message that fails is skipped and counted on its own.
    """
    if not isinstance(conversation, dict) or not isinstance(conversation.get("mapping"), dict):
        errors[SKIPPED_CONVERSATION] += 1
        return []
    title = conversation.get("title", "<no title>")
    shown_ids = shown_message_ids(conversation)

    rows = []
    for id, turn in conversation["mapping"].items():
        if not isinstance(turn, dict):
            errors[SKIPPED_MESSAGE] += 1
            continue
        if not isinstance(turn.get("message"), dict):
            continue  # structural node (e.g. the root), not a message
        try:
            row = message_row(id, turn, title, shown_ids, errors)
        except Exception as e:
            logger.error("Skipped a message: %s", type(e).__name__)
            errors[SKIPPED_MESSAGE] += 1
            continue
        if row["role"] != "":
            rows.append(row)
    return rows


def message_row(id, turn: dict, title, shown_ids: set[str] | None, errors: Counter) -> dict:
    """One table row for a mapping entry whose ``message`` is a dict."""
    message = turn["message"]
    metadata = message.get("metadata")
    if not isinstance(metadata, dict):
        metadata = {}
    content_type, text = message_text(message.get("content"))

    denested_d = eh.dict_denester(turn)
    role = eh.find_item(denested_d, "role")
    # Read from the message itself: a null time is absent (not unreadable),
    # and a message without one must not borrow a nested create_time.
    raw_time = message.get("create_time")
    if raw_time is None:
        raw_time = ""
    time = eh.epoch_to_iso(raw_time, errors=errors, keep_invalid=False)
    return {
        "conversation title": title,
        "role": role,
        "message": redact.redact(text),
        "content type": content_type,
        "model": eh.find_item(denested_d, "-model_slug"),
        "time": time,
        # The original value when it could not be read as a time (Eyra review
        # R05): "time" stays ISO 8601 or empty, and nothing is lost.
        "unreadable time": str(raw_time) if time == "" and raw_time not in ("", None) else "",
        "message id": id,
        "reaction to": eh.find_item(denested_d, "parent"),
        "hidden": shown_ids is not None and id not in shown_ids,
        "content references": redact.redact_json(metadata.get("content_references", [])),
        "search_result_groups": redact.redact_json(metadata.get("search_result_groups", [])),
    }


def message_text(content) -> tuple[str, str]:
    """Return ``(content type, text)`` for a message's ``content``.

    Always returns strings: a missing or ``null`` field gives empty text
    rather than an error, since the export simply holds no text there.
    """
    if not isinstance(content, dict):
        return "", ""
    content_type = content.get("content_type", "")
    if not isinstance(content_type, str):
        content_type = str(content_type)

    if content_type == "text":
        return content_type, _join_text(content.get("parts"))
    if content_type == "multimodal_text":
        # parts mixes plain strings with dicts (image/audio asset pointers,
        # audio transcriptions); keep the text.
        parts = content.get("parts")
        parts = parts if isinstance(parts, list) else []
        return content_type, _join_text([
            part.get("text") if isinstance(part, dict) else part for part in parts
        ])
    if content_type == "thoughts":
        thoughts = content.get("thoughts")
        thoughts = thoughts if isinstance(thoughts, list) else []
        return content_type, _join_text([
            thought.get("summary") for thought in thoughts if isinstance(thought, dict)
        ])
    if content_type == "reasoning_recap":
        return content_type, _join_text(content.get("content"))
    return content_type, "[Unhandled content type: " + content_type + "]"


def _join_text(value) -> str:
    """Text from a string or a list of parts; non-text parts are left out."""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(part for part in value if isinstance(part, str))
    return ""


# ---------------------------------------------------------------------------
# Extractor registry & platform info
# ---------------------------------------------------------------------------

#: Mapping from the string names used in port_config.json to actual extractor functions.
EXTRACTOR_REGISTRY: dict[str, Callable[..., pd.DataFrame]] = {
    "conversations_to_df": conversations_to_df,
}


# ---------------------------------------------------------------------------
# Main extraction & flow
# ---------------------------------------------------------------------------

def extraction(chatgpt_zip: SeekableBinaryReader, validation) -> ExtractionResult:
    """Extract data from a ChatGPT DDP zip and return consent-form tables.

    Parameters
    ----------
    chatgpt_zip:
        Seekable binary reader over the ChatGPT DDP zip — the upload
        adapter itself, never a path (ADR-0026).
    validation:
        Validation result object whose ``archive_members`` attribute is passed
        to ``ZipArchiveReader``.
    """
    config = load_port_config(EXTRACTOR_REGISTRY, "chatgpt")
    errors: Counter = Counter()
    reader = ZipArchiveReader(chatgpt_zip, validation.archive_members, errors)
    return run_extraction(reader, errors, config)


class ChatGPTFlow(FlowBuilder):
    """Flow implementation for the ChatGPT data donation study."""

    def __init__(self, session_id: str):
        super().__init__(session_id, "ChatGPT")

    def validate_file(self, file):
        return validate.validate_zip(DDP_CATEGORIES, file)

    def extract_data(self, file, validation):
        return extraction(file, validation)


def process(session_id):
    flow = ChatGPTFlow(session_id)
    return flow.start_flow()
