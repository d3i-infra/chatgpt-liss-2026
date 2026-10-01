class CommandUIRender:
    __slots__ = "page"

    def __init__(self, page):
        self.page = page

    def toDict(self):
        dict = {}
        dict["__type__"] = "CommandUIRender"
        dict["page"] = self.page.toDict()
        return dict


class CommandSystemDonate:
    __slots__ = "key", "json_string", "staged_id"

    def __init__(self, key, json_string, staged_id=None):
        self.key = key
        self.json_string = json_string
        # Id of a donation the UI staged; the page's CommandRouter substitutes
        # the data, so json_string stays empty and the data never enters Python.
        self.staged_id = staged_id

    def toDict(self):
        dict = {}
        dict["__type__"] = "CommandSystemDonate"
        dict["key"] = self.key
        dict["json_string"] = self.json_string
        if self.staged_id is not None:
            dict["staged_id"] = self.staged_id
        return dict


class CommandSystemLog:
    __slots__ = "level", "message"

    def __init__(self, level, message):
        self.level = level
        self.message = message

    def toDict(self):
        import json
        # Build payload once so json_string can never diverge from the direct fields.
        payload = {"level": self.level, "message": self.message}
        return {
            "__type__": "CommandSystemLog",
            **payload,
            # TODO: json_string is temporary for backwards compatibility with mono host, remove once host updated
            "json_string": json.dumps(payload),
        }


class CommandSystemExit:
    __slots__ = "code", "info"

    def __init__(self, code, info):
        self.code = code
        self.info = info

    def toDict(self):
        dict = {}
        dict["__type__"] = "CommandSystemExit"
        dict["code"] = self.code
        dict["info"] = self.info
        return dict
