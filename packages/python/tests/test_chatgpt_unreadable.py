"""Eyra review R04: an unreadable ChatGPT export (invalid or truncated
conversations JSON) must reach the plain "file could not be read" page with
a choice to pick another file — never a traceback page.
"""
import io
import json
import zipfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from port.api.commands import CommandSystemLog, CommandUIRender
from port.platforms.chatgpt import ChatGPTFlow

CONFIG = Path(__file__).parent.parent / "port" / "configs" / "chatgpt_config.json"

pytestmark = pytest.mark.skipif(
    not CONFIG.exists(), reason="chatgpt_config.json not generated (pnpm generate-config chatgpt)"
)


class UploadAdapter(io.BytesIO):
    """In-memory stand-in for the worker's AsyncFileAdapter (has .size)."""

    @property
    def size(self) -> int:
        return len(self.getbuffer())


def payload(type_name, **attrs):
    p = MagicMock()
    p.__type__ = type_name
    for k, v in attrs.items():
        setattr(p, k, v)
    return p


def upload(conversations_bytes: bytes):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("conversations.json", conversations_bytes)
        z.writestr("user.json", json.dumps({"id": "user-x"}))
    return payload("PayloadFile", value=UploadAdapter(buf.getvalue()))


def next_page(gen, response):
    cmd = gen.send(response)
    while isinstance(cmd, CommandSystemLog):
        cmd = gen.send(payload("PayloadVoid"))
    return cmd


def first_page(gen):
    cmd = next(gen)
    while isinstance(cmd, CommandSystemLog):
        cmd = gen.send(payload("PayloadVoid"))
    return cmd


@pytest.mark.parametrize("content", [
    b'[{"title": "Chat", "mapping": {"a": {"message": ',  # truncated
    b"this is not json",
])
def test_unreadable_conversations_file_offers_another_file(content):
    gen = ChatGPTFlow("session").start_flow()
    first_page(gen)

    cmd = next_page(gen, upload(content))

    assert isinstance(cmd, CommandUIRender)
    page = json.dumps(cmd.toDict())
    assert "File could not be read" in page
    assert "Choose another file" in page
    assert "Traceback" not in page

    # Choosing another file returns to the upload prompt.
    cmd = next_page(gen, payload("PayloadTrue"))
    assert "Select your ChatGPT file" in json.dumps(cmd.toDict())
