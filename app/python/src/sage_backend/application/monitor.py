"""Monitor workspace operations: the streams each device offers and the panels that show them.

Panels only watch device streams; writing to a device is a tool call (its action dialog,
a test step or the Agent), never a panel source.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sage_backend.contracts.errors import app_error
from sage_backend.contracts.monitor import (
    PANEL_WIDGETS,
    SOURCE_TYPES,
    free_frame,
    parse_control,
    parse_monitor,
    parse_monitor_update_input,
    placed,
)
from sage_backend.contracts.operations import operation

from .authorization import Authorizer, Json

if TYPE_CHECKING:
    from sage_backend.devices import DeviceCatalogService, DeviceService
    from sage_backend.projects.project_service import ProjectService
    from sage_backend.projects.protocol_bindings import ProjectProtocols
    from sage_backend.wiring.project_wiring_service import ProjectWiringService


def _key(channel: Json) -> tuple[str, str]:
    return channel["hardwareId"], channel["streamId"]


def _panel(panels: list[Json], panel_id: str) -> Json:
    for panel in panels:
        if panel["id"] == panel_id:
            return panel
    raise app_error(
        "invalid_argument",
        f"no panel {panel_id}; panels: {', '.join(item['id'] for item in panels) or 'none'}",
    )


def _short(remote_name: str, siblings: list[Json]) -> str:
    """A tool's name without the prefix every tool of the device shares (``sds48_set_relay``
    -> ``set_relay``), as the operator sees it."""
    prefix = remote_name.split("_", 1)[0]
    shared = "_" in remote_name and all(
        str(item["remoteName"]).startswith(prefix + "_") for item in siblings
    )
    return remote_name[len(prefix) + 1 :] if shared else remote_name


def _new_id(panels: list[Json], kind: str) -> str:
    taken = {panel["id"] for panel in panels}
    if kind not in taken:
        return kind
    index = 2
    while f"{kind}{index}" in taken:
        index += 1
    return f"{kind}{index}"


class MonitorApplication:
    def __init__(
        self,
        authorizer: Authorizer,
        projects: ProjectService,
        wiring: ProjectWiringService,
        catalog: DeviceCatalogService,
        devices: DeviceService,
        protocols: ProjectProtocols | None = None,
    ) -> None:
        self.authorizer, self.projects, self.wiring = authorizer, projects, wiring
        self.catalog, self.devices, self.protocols = catalog, devices, protocols

    @operation(
        "monitor.streams",
        capability="hardware.read",
        risk="read",
        profiles=("plan", "explore"),
        idempotency="natural",
    )
    def streams(self, context: Json) -> list[Json]:
        """Every device with the streams it declares (``known`` is false until the device was
        connected once; the cached declaration is used while it is offline), then the protocol
        fields decoded on it (``derived``)."""
        result: list[Json] = []
        for hardware in self.catalog.list_hardware():
            if hardware["kind"] != "managed":
                continue
            streams = self.devices.known_streams(hardware["hardwareId"])
            if streams is not None and self.protocols is not None:
                streams = [*streams, *self.protocols.streams(hardware["hardwareId"])]
            result.append(
                {
                    "hardwareId": hardware["hardwareId"],
                    "label": hardware["label"],
                    "known": streams is not None,
                    "streams": streams or [],
                }
            )
        return result

    @operation(
        "monitor.get",
        capability="projects.read",
        risk="read",
        profiles=("plan", "explore"),
        idempotency="natural",
    )
    def get(self, context: Json) -> Json:
        """The monitor canvas: its panels (type, title, sources, settings, frame)."""
        monitor = self.projects.monitor()
        return {**monitor, "panels": placed(monitor["panels"])}

    @operation(
        "monitor.update",
        capability="projects.manage",
        risk="write",
        profiles=("plan", "explore"),
        idempotency="natural",
        confirm=True,
    )
    async def update(self, context: Json, input: Json) -> Json:
        """Change the canvas: ``panels`` replaces every panel (a generated layout, an import);
        ``operations`` then apply in order (add / remove / update — retitle, settings, move or
        resize — a panel, add / remove its sources); ``remove`` takes each stream off
        every panel and ``add`` puts it on the first panel that draws its type (never creating
        one). A new panel without a frame goes in the first free spot. A stream must belong to a
        registered device and, once the device's streams are known, be one it declares (or a
        protocol field) and one the panel can draw; a binding must name a tool its device has,
        with arguments the tool takes. An Agent's change waits for the operator to confirm it.
        Stays in the project buffer until the project is saved. Returns the canvas."""
        request = parse_monitor_update_input(input)
        monitor = self.projects.monitor()
        panels: list[Json] = placed(monitor["panels"])
        if "panels" in request:
            panels = []
            for given in request["panels"]:
                if any(panel["id"] == given["id"] for panel in panels):
                    raise app_error("invalid_argument", f"panel {given['id']} already exists")
                panel = {
                    **given,
                    "sources": [],
                    "settings": self._settings(given, given["settings"]),
                }
                self._add_sources(panel, given["sources"])
                if not panel.get("frame"):
                    panel["frame"] = free_frame(panels, panel["type"])
                panels.append(panel)
        for item in request.get("operations", []):
            self._apply(panels, item)
        removed = {_key(item) for item in request.get("remove", [])}
        for panel in panels:
            panel["sources"] = [item for item in panel["sources"] if _key(item) not in removed]
        for item in request.get("add", []):
            self._add_default(panels, item)
        self.projects.update_monitor(parse_monitor({**monitor, "panels": panels}))
        self.wiring.notify_project_changed()
        return self.projects.monitor()

    def _apply(self, panels: list[Json], change: Json) -> None:
        op = change["op"]
        if op == "addPanel":
            spec = change["panel"]
            panel_id = spec.get("id") or _new_id(panels, spec["type"])
            if any(panel["id"] == panel_id for panel in panels):
                raise app_error("invalid_argument", f"panel {panel_id} already exists")
            panel: Json = {
                "id": panel_id,
                "type": spec["type"],
                "sources": [],
                "settings": self._settings(spec, spec.get("settings", {})),
            }
            if spec.get("title") is not None:
                panel["title"] = spec["title"]
            panel["frame"] = spec.get("frame") or free_frame(panels, spec["type"])
            self._add_sources(panel, spec.get("sources", []))
            panels.append(panel)
            return
        panel = _panel(panels, change["panelId"])
        if op == "removePanel":
            panels.remove(panel)
        elif op == "updatePanel":
            if "title" in change:
                panel["title"] = change["title"]
            if "frame" in change:
                panel["frame"] = change["frame"]
            if "settings" in change:
                panel["settings"] = self._settings(
                    panel, {**panel["settings"], **change["settings"]}
                )
        elif op == "addSources":
            self._add_sources(panel, change["sources"])
        else:
            removed = {_key(item) for item in change["sources"]}
            panel["sources"] = [item for item in panel["sources"] if _key(item) not in removed]

    def _settings(self, panel: Json, settings: Json) -> Json:
        """An operating component's binding, checked against the tools of its device."""
        widget = PANEL_WIDGETS.get(panel["type"])
        if widget is None or not isinstance(settings.get("control"), dict):
            return dict(settings)
        control = parse_control({"id": "c1", "widget": widget, **settings["control"]})
        if control["widget"] != widget:
            raise app_error("invalid_argument", f"a {panel['type']} takes a {widget} control")
        self._check_control(control)
        return {**settings, "control": control}

    def _check_control(self, control: Json) -> None:
        hardware = self.catalog.find_hardware(control["hardwareId"])
        if hardware is None or hardware["kind"] != "managed":
            raise app_error(
                "invalid_argument", f"{control['hardwareId']} is not a registered device"
            )
        if control["widget"] != "button" and not control.get("param"):
            raise app_error(
                "invalid_argument", f"a {control['widget']} control needs the param it sets"
            )
        tools = [
            item
            for item in self.devices.list_tools()
            if item.get("deviceId") == hardware.get("deviceId") and item.get("kind") == "hardware"
        ]
        if not tools:
            return  # The device is offline: its tools are checked when it is back.
        names = {_short(item["remoteName"], tools): item for item in tools}
        tool = names.get(control["tool"]) or next(
            (item for item in tools if item["remoteName"] == control["tool"]), None
        )
        if tool is None:
            raise app_error(
                "invalid_argument",
                f"{control['hardwareId']} has no tool {control['tool']}; tools: "
                + ", ".join(sorted(names)),
            )
        control["tool"] = tool["remoteName"]
        properties = (tool.get("inputSchema") or {}).get("properties") or {}
        unknown = [
            name
            for name in [*control["fixed"], control.get("param")]
            if name and name not in properties
        ]
        if unknown:
            raise app_error(
                "invalid_argument",
                f"{control['tool']} takes no argument {', '.join(unknown)}; it takes "
                + (", ".join(properties) or "none"),
            )

    def _add_sources(self, panel: Json, sources: list[Json]) -> None:
        accepted = SOURCE_TYPES[panel["type"]]
        for item in sources:
            stream_type = self._check(item)
            if stream_type is not None and stream_type not in accepted:
                raise app_error(
                    "invalid_argument",
                    f"{item['hardwareId']}.{item['streamId']} is a {stream_type} stream; a "
                    f"{panel['type']} panel draws {', '.join(accepted) or 'no streams'}",
                )
            if _key(item) not in {_key(entry) for entry in panel["sources"]}:
                panel["sources"].append(
                    {"hardwareId": item["hardwareId"], "streamId": item["streamId"]}
                )

    def _add_default(self, panels: list[Json], item: Json) -> None:
        stream_type = self._check(item)
        if any(_key(item) in {_key(entry) for entry in panel["sources"]} for panel in panels):
            return
        panel = next(
            (
                panel
                for panel in panels
                if SOURCE_TYPES[panel["type"]]
                and (stream_type is None or stream_type in SOURCE_TYPES[panel["type"]])
            ),
            None,
        )
        if panel is None:
            raise app_error(
                "invalid_argument",
                f"no panel can show {item['hardwareId']}.{item['streamId']}"
                + (f" ({stream_type})" if stream_type else "")
                + "; add one with addPanel (and its sources) first",
            )
        self._add_sources(panel, [item])

    def _check(self, channel: Json) -> str | None:
        """The stream's type (``None`` while the device's streams are unknown); raises when the
        device is not registered or does not declare the stream."""
        hardware = self.catalog.find_hardware(channel["hardwareId"])
        if hardware is None or hardware["kind"] != "managed":
            raise app_error(
                "invalid_argument", f"{channel['hardwareId']} is not a registered device"
            )
        streams = self.devices.known_streams(channel["hardwareId"])
        if streams is None:
            return None
        if self.protocols is not None:
            streams = [*streams, *self.protocols.streams(channel["hardwareId"])]
        for item in streams:
            if item["id"] == channel["streamId"]:
                return str(item["type"])
        raise app_error(
            "invalid_argument",
            f"{channel['hardwareId']} declares no stream {channel['streamId']}; "
            "read monitor_streams for exact ids",
        )
