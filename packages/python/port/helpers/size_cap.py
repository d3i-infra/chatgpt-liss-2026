"""Keep a donation within what the participant's browser can handle.

When an export holds more than the budget, the most recent conversations are
kept and older ones left out, and the participant is told before consenting
(ADR-0048, Eyra review R01/R02). Nothing is left out silently: the counts and
the date from which conversations are included are donated with the table.

Selection happens while the conversations parts are read, one conversation at
a time, so Python never holds more than the budget (plus one conversation).
"""

import heapq
import json
from collections import Counter

import port.helpers.port_helpers as ph
from port.helpers.device import is_low_memory_device

#: Total donation for a typical computer: Next's request limit. The donation is
#: sent in parts (ADR-0047); 218 MB completed on the 8 GB-laptop profile.
BUDGET_BYTES = 210_000_000

#: Total donation when the browser reports 4 GB of RAM or less (device.py).
LOW_MEMORY_BUDGET_BYTES = 60_000_000


def donation_budget_bytes(memory_gb: float | None = None) -> int:
    """The budget for this device: lower only when the browser reports little RAM."""
    return LOW_MEMORY_BUDGET_BYTES if is_low_memory_device(memory_gb) else BUDGET_BYTES


def estimated_donation_bytes(tables) -> int:
    """Rough donated size of the review tables, column by column (no per-row work,
    no full serialization). Counts characters, so non-ASCII text is undercounted;
    good enough to decide whether the participant should close other tabs."""
    import pandas as pd

    total = 0
    for table in tables:
        df = getattr(table, "data_frame", None)
        if not isinstance(df, pd.DataFrame) or df.empty:
            continue
        rows = len(df)
        for column in df.columns:
            total += rows * (len(json.dumps(str(column), ensure_ascii=False)) + 4)
            values = df[column]
            if values.dtype == object:
                total += int(values.astype(str).str.len().sum())
            else:
                total += rows * 6
    return total


def row_bytes(row: dict) -> int:
    """Estimated donated size of one row: its JSON as the consent page writes it
    (no spaces, UTF-8 without escapes), plus the separating comma."""
    return len(json.dumps(row, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")) + 1


class RecentFirstSelection:
    """The most recent conversations whose rows fit in ``budget_bytes``.

    Conversations may arrive in any order (export parts are not chronological).
    The result is always every conversation more recent than a cutoff: once a
    conversation has been left out for size, every older one is left out too.
    """

    def __init__(self, budget_bytes: int):
        self.budget_bytes = budget_bytes
        self._kept: list[tuple[str, int, int, list[dict]]] = []  # heap: oldest first
        self._total = 0
        self._order = 0
        self._cutoff: str | None = None  # recency of the newest conversation left out
        self.left_out = 0

    @staticmethod
    def recency(rows: list[dict]) -> str:
        """The conversation's last activity: its latest readable message time
        (ISO 8601, so strings sort chronologically); "" when it has none."""
        return max((r.get("time") or "" for r in rows), default="")

    def offer(self, rows: list[dict]) -> None:
        if not rows:
            return
        recency = self.recency(rows)
        self._order += 1
        if self._cutoff is not None and recency <= self._cutoff:
            self._leave_out(recency)
            return
        size = sum(row_bytes(r) for r in rows)
        heapq.heappush(self._kept, (recency, self._order, size, rows))
        self._total += size
        while self._total > self.budget_bytes and self._kept:
            old_recency, _, old_size, _ = heapq.heappop(self._kept)
            self._total -= old_size
            self._leave_out(old_recency)

    def _leave_out(self, recency: str) -> None:
        self.left_out += 1
        if self._cutoff is None or recency > self._cutoff:
            self._cutoff = recency

    @property
    def kept(self) -> int:
        return len(self._kept)

    def rows(self) -> list[dict]:
        """Rows of the kept conversations, in the order they were read."""
        return [row for _, _, _, rows in sorted(self._kept, key=lambda k: k[1]) for row in rows]

    def count_into(self, errors: Counter) -> None:
        """Donated counts (``extraction errors``), only when something was left out."""
        if not self.left_out:
            return
        errors[ph.SIZE_CAP_LEFT_OUT] += self.left_out
        errors[ph.SIZE_CAP_INCLUDED] = self.kept
        errors[ph.SIZE_CAP_BUDGET_MB] = self.budget_bytes // 1_000_000
        oldest = min((recency for recency, _, _, _ in self._kept if recency), default="")
        if oldest[:10].count("-") == 2:
            errors[ph.SIZE_CAP_INCLUDED_FROM] = int(oldest[:10].replace("-", ""))
