"""navigator.deviceMemory may only lower the memory budget (Eyra review R01/R02)."""
import sys
from types import SimpleNamespace

import pytest

from port.helpers.device import device_memory_gb, is_low_memory_device


@pytest.fixture
def browser(monkeypatch):
    def report(navigator):
        monkeypatch.setitem(sys.modules, "js", SimpleNamespace(navigator=navigator))
    return report


@pytest.mark.parametrize("reported, low", [(0.5, True), (2, True), (4, True), (8, False)])
def test_chrome_and_edge_report_ram(browser, reported, low):
    browser(SimpleNamespace(deviceMemory=reported))
    assert device_memory_gb() == reported
    assert is_low_memory_device() is low


def test_firefox_and_safari_report_nothing_and_get_the_normal_budget(browser):
    browser(SimpleNamespace())  # no deviceMemory attribute at all
    assert device_memory_gb() is None
    assert is_low_memory_device() is False


@pytest.mark.parametrize("value", [None, "4", True, 0, -1])
def test_unusable_values_are_ignored(browser, value):
    browser(SimpleNamespace(deviceMemory=value))
    assert device_memory_gb() is None
    assert is_low_memory_device() is False


def test_outside_the_browser_nothing_is_reported(monkeypatch):
    monkeypatch.delitem(sys.modules, "js", raising=False)
    monkeypatch.setattr("builtins.__import__", _no_js(__import__))
    assert device_memory_gb() is None


def _no_js(real_import):
    def guarded(name, *args, **kwargs):
        if name == "js":
            raise ImportError("no js module outside Pyodide")
        return real_import(name, *args, **kwargs)
    return guarded
