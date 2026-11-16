"""Each table carries the error counts its own extractor produced (Eyra
review R03): they are donated with that table, while the shared counter
still holds the total for the flow's log and participant notice."""
from collections import Counter

import pandas as pd

import port.api.props as props
from port.helpers.table_extractor import TableConfig, run_extraction

T = props.Translatable({"en": "T"})


def first(reader, errors):
    errors["SkippedMessage"] += 2
    return pd.DataFrame({"a": [1]})


def second(reader, errors):
    errors["TimestampParseError"] += 1
    return pd.DataFrame({"b": [1]})


def test_each_table_gets_only_its_own_extraction_errors():
    errors: Counter = Counter({"Earlier": 1})
    config = [
        TableConfig(id="one", extractor=first, title=T, description=T, headers={}),
        TableConfig(id="two", extractor=second, title=T, description=T, headers={}),
    ]
    result = run_extraction(None, errors, config)

    by_id = {t.id: t.extraction_errors for t in result.tables}
    assert by_id == {"one": {"SkippedMessage": 2}, "two": {"TimestampParseError": 1}}
    assert result.errors == Counter({"Earlier": 1, "SkippedMessage": 2, "TimestampParseError": 1})
