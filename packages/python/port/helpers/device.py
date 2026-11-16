"""What the browser reports about the participant's device.

Only ``navigator.deviceMemory`` is used: total RAM, coarsened to a power of two
(older Chrome versions also capped it at 8; the Chromium tested on 2026-11-16
reported 16 on a 15 GB machine). Chrome and Edge report it in secure contexts,
also inside the worker Python runs in and inside Next's task iframe; Firefox
and Safari do not. Browsers expose no measure of *free* memory.

The value may only ever *lower* a memory budget: a missing or unreadable value
means "assume a typical 8 GB computer" (Eyra review R01/R02).
"""

import logging

logger = logging.getLogger(__name__)

#: Devices that report this much RAM or less get the smaller donation budget.
#: An 8 GB computer reports 8; a 6 GB one reports 4.
LOW_MEMORY_GB = 4


def device_memory_gb() -> float | None:
    """``navigator.deviceMemory`` in GB, or None when the browser does not report it."""
    try:
        import js  # pyright: ignore[reportMissingModuleSource]

        value = js.navigator.deviceMemory
    except Exception:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        return None
    return float(value)


def is_low_memory_device(memory_gb: float | None = None) -> bool:
    """True only when the browser reports ``LOW_MEMORY_GB`` or less."""
    if memory_gb is None:
        memory_gb = device_memory_gb()
    return memory_gb is not None and memory_gb <= LOW_MEMORY_GB
