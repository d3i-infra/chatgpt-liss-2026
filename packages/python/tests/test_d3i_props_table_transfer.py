"""The consent-viz table crosses to the page as UTF-8 JSON bytes (transferred, not cloned)."""
import json

import pandas as pd

from port.api import d3i_props, props


def make_table(df):
    return d3i_props.PropsUIPromptConsentFormTableViz(
        id="t", title=props.Translatable({"en": "T"}), data_frame=df
    )


def test_data_frame_is_utf8_json_bytes_equal_to_to_json():
    df = pd.DataFrame({"message": ["héllo – “quoted”", "👋"], "n": [1, 2]})
    out = make_table(df).toDict()["data_frame"]
    assert isinstance(out, bytes)
    assert out.decode("utf-8") == df.to_json()
    assert json.loads(out) == json.loads(df.to_json())


def test_non_dataframe_value_passes_through():
    assert make_table('{"a":{}}').toDict()["data_frame"] == '{"a":{}}'
