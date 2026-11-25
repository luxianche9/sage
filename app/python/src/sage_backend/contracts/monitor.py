"""The project's host-computer canvas: one page of components, each showing some device streams.

A component (a ``panel`` in the project file) has a ``type`` that decides how it draws its
``sources`` (streams a device plugin declares or protocol fields) — see :data:`SOURCE_TYPES`; it
ignores sources it cannot draw. ``settings`` are its own (see :data:`PANEL_SETTINGS`). The
operating components (``button``, ``switch``, ``slider``, ``select``) hold one binding to a device
tool in ``settings.control`` and show their first source as the value read back; the operator
binds them by hand (docs/decisions 0007). ``frame`` is where the component sits on the canvas, in
grid cells (:data:`GRID_PX` pixels); one without a frame is placed in the first free spot.
"""

from typing import Any

from sage_backend.contracts.validation import (
    array,
    discriminated,
    enum,
    literal,
    number,
    obj,
    parse_record,
    record,
    string,
    unknown,
)
from sage_backend.util import Record

SOURCE_TYPES: dict[str, tuple[str, ...]] = {
    "scope": ("scalar", "block", "bits"),
    "number": ("scalar", "block"),
    "values": ("scalar", "block"),
    "lamp": ("bits", "scalar"),
    "terminal": ("bytes", "frames"),
    "trace": ("bytes", "frames"),
    "button": (),
    "switch": ("bits", "scalar"),
    "slider": ("scalar", "block"),
    "select": ("scalar", "bits"),
    "results": (),
    "label": (),
    "group": (),
}
PANEL_TYPES = tuple(SOURCE_TYPES)
PANEL_DESCRIPTIONS = {
    "scope": "waveform over time: analog streams overlaid, bits streams as logic lanes",
    "number": "one value with its unit, as digits, a bar or a dial; red outside its limits",
    "values": "table of many streams: current value, min / max / mean over the shown window",
    "lamp": "indicator lamps: the bits of a bits stream (all, or settings.bits), or a value "
    "at or above settings.threshold",
    "terminal": "serial and bus records as text or hex",
    "trace": "frame table: one row per record with direction, id and bytes; a row unfolds",
    "button": "a button that calls a device tool once",
    "switch": "an on/off switch that calls a device tool and shows the state read back",
    "slider": "a slider that calls a device tool on release and shows the value read back",
    "select": "a choice of preset values that calls a device tool with the one picked",
    "results": "the run's verdicts",
    "label": "static text: a heading or a note on the canvas",
    "group": "a titled frame drawn behind the components placed inside it",
}
PANEL_SETTINGS = {
    "number": '{display?: "digits" | "bar" | "dial", min?, max?, decimals?: 0..6, lo?, hi?}',
    "values": "{limits?: {'<hardwareId>/<streamId>': {lo?, hi?}}}",
    "lamp": "{bits?: [n] (of a bits stream; all when absent), threshold?: number (a value)}",
    "terminal": '{mode?: "text" | "hex"}',
    "button": "{control: control (widget button), confirm?: boolean}",
    "switch": "{control: control (widget toggle; on / off are the values sent, true / false "
    "when absent), bit?: n (of the bits stream read back)}",
    "slider": "{control: control (widget slider; min / max / step)}",
    "select": "{control: control (widget presets; presets are the values, labels their names)}",
    "label": '{text, size?: "sm" | "md" | "lg"}',
}
WIDGETS = ("button", "toggle", "slider", "presets")
PANEL_WIDGETS = {"button": "button", "switch": "toggle", "slider": "slider", "select": "presets"}
"""The widget of each operating component's ``settings.control``."""
GRID_PX = 20
"""Size of a canvas grid cell in pixels."""
CANVAS_COLUMNS = 60
"""Columns new panels are placed within (the canvas itself grows as needed)."""
PANEL_SIZES: dict[str, tuple[int, int]] = {
    "scope": (30, 14), "number": (8, 4), "values": (20, 10), "lamp": (10, 3),
    "terminal": (24, 12), "trace": (30, 14), "button": (6, 2), "switch": (8, 2),
    "slider": (12, 3), "select": (10, 3), "results": (20, 10), "label": (8, 2), "group": (16, 10),
}  # fmt: skip
"""Width and height (cells) a new panel of each type gets."""

stream_ref_schema = obj(
    {
        "hardwareId": string(1).describe("Device hardwareId, from monitor_streams."),
        "streamId": string(1).describe("Stream id the device declares, from monitor_streams."),
    },
    strict=True,
)
frame_schema = obj(
    {
        "x": number(0, 10_000, integer=True).describe("Left edge, grid cells from the left."),
        "y": number(0, 10_000, integer=True).describe("Top edge, grid cells from the top."),
        "w": number(1, 400, integer=True).describe("Width in grid cells."),
        "h": number(1, 400, integer=True).describe("Height in grid cells."),
    },
    strict=True,
)
control_schema = obj(
    {
        "id": string(1, 64).optional().describe("Control id; generated when absent."),
        "label": string(0, 80)
        .optional()
        .describe("Text on the control; the tool name when absent."),
        "hardwareId": string(1).describe("Device whose tool the control calls."),
        "tool": string(1).describe("Device tool name, with or without the device prefix."),
        "widget": enum(*WIDGETS).describe(
            "button: one call; toggle: param is a boolean, called with the new state; slider: "
            "param is a number, called on release; presets: one button per preset value of param."
        ),
        "param": string(1)
        .optional()
        .describe("The argument the operator sets (toggle, slider, presets)."),
        "fixed": record(unknown()).default({}).describe("Arguments fixed by the control."),
        "presets": array(unknown()).optional().describe("Values of param offered to pick from."),
        "labels": array(string(0, 40)).optional().describe("A name per preset, in order."),
        "on": unknown()
        .optional()
        .describe("Toggle: the value sent to switch on; true when absent."),
        "off": unknown()
        .optional()
        .describe("Toggle: the value sent to switch off; false when absent."),
        "min": number().optional().describe("Slider minimum; the parameter's when absent."),
        "max": number().optional().describe("Slider maximum; the parameter's when absent."),
        "step": number().optional().describe("Slider step; chosen from the range when absent."),
    },
    strict=True,
)
panel_schema = obj(
    {
        "id": string(1, 64),
        "type": enum(*PANEL_TYPES),
        "title": string(0, 80).optional(),
        "sources": array(stream_ref_schema).default([]),
        "settings": record(unknown()).default({}),
        "frame": frame_schema.optional(),
    },
)
monitor_schema = obj({"panels": array(panel_schema).default([])})

_PANEL_ID = string(1).describe("Panel id, from get_monitor.")
_SOURCES = array(stream_ref_schema, 1).describe("Streams (hardwareId + streamId).")
_TITLE = string(0, 80).optional().describe("Title over the panel.")
_FRAME = frame_schema.optional().describe(
    f"Where it sits on the canvas, in {GRID_PX}px grid cells; first free spot when absent."
)
_SETTINGS_TEXT = "; ".join(f"{kind}: {text}" for kind, text in PANEL_SETTINGS.items())
_NEW_PANEL = obj(
    {
        "id": string(1, 64).optional().describe("Panel id; generated when absent."),
        "type": enum(*PANEL_TYPES).describe(
            "; ".join(f"{kind}: {text}" for kind, text in PANEL_DESCRIPTIONS.items())
        ),
        "title": _TITLE,
        "sources": array(stream_ref_schema).optional().describe("Streams the panel shows."),
        "settings": record(unknown()).optional().describe(f"Panel settings. {_SETTINGS_TEXT}."),
        "frame": _FRAME,
    },
    strict=True,
)
operation_schema = discriminated(
    "op",
    {
        "addPanel": obj(
            {
                "op": literal("addPanel").describe("Add a panel."),
                "panel": _NEW_PANEL.describe("The new panel."),
            },
            strict=True,
        ),
        "removePanel": obj(
            {"op": literal("removePanel").describe("Remove a panel."), "panelId": _PANEL_ID},
            strict=True,
        ),
        "updatePanel": obj(
            {
                "op": literal("updatePanel").describe(
                    "Retitle a panel, change its settings or move / resize it."
                ),
                "panelId": _PANEL_ID,
                "title": _TITLE,
                "frame": frame_schema.optional().describe("New place and size, in grid cells."),
                "settings": record(unknown())
                .optional()
                .describe("Merged into the panel's settings (each key replaced)."),
            },
            strict=True,
        ),
        "addSources": obj(
            {
                "op": literal("addSources").describe("Show more streams on a panel."),
                "panelId": _PANEL_ID,
                "sources": _SOURCES,
            },
            strict=True,
        ),
        "removeSources": obj(
            {
                "op": literal("removeSources").describe("Stop showing streams on a panel."),
                "panelId": _PANEL_ID,
                "sources": _SOURCES,
            },
            strict=True,
        ),
    },
)
monitor_update_input_schema = obj(
    {
        "panels": array(panel_schema).optional(),
        "operations": array(operation_schema).optional(),
        "add": array(stream_ref_schema).optional(),
        "remove": array(stream_ref_schema).optional(),
    },
    strict=True,
)


def parse_monitor(value: Any) -> Record:
    return parse_record(monitor_schema, value)


def parse_monitor_update_input(value: Any) -> Record:
    return parse_record(monitor_update_input_schema, value)


def parse_control(value: Any) -> Record:
    return parse_record(control_schema, value)


def free_frame(panels: list[Record], kind: str) -> Record:
    """The first spot (top to bottom, left to right) where a new ``kind`` panel overlaps none."""
    w, h = PANEL_SIZES.get(kind, (12, 8))
    taken = [panel["frame"] for panel in panels if panel.get("frame")]

    def free(x: int, y: int) -> bool:
        return all(
            x + w <= f["x"] or f["x"] + f["w"] <= x or y + h <= f["y"] or f["y"] + f["h"] <= y
            for f in taken
        )

    y = 0
    while True:
        for x in range(0, max(1, CANVAS_COLUMNS - w + 1)):
            if free(x, y):
                return {"x": x, "y": y, "w": w, "h": h}
        y += 1


def placed(panels: list[Record]) -> list[Record]:
    """``panels`` with a frame each: one without (an older project) gets the first free spot."""
    output: list[Record] = []
    for panel in panels:
        output.append(
            panel if panel.get("frame") else {**panel, "frame": free_frame(output, panel["type"])}
        )
    return output


def monitor_channels(monitor: Record) -> list[Record]:
    """Every stream some panel shows, once, in panel order."""
    seen: set[tuple[str, str]] = set()
    channels: list[Record] = []
    for panel in monitor.get("panels", []):
        for source in panel.get("sources", []):
            key = (source["hardwareId"], source["streamId"])
            if key not in seen:
                seen.add(key)
                channels.append({"hardwareId": key[0], "streamId": key[1]})
    return channels
