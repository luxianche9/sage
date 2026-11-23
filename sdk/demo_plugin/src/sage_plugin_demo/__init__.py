"""SAGE test plugin: the SDK demo device, installable, for the platform's own tests.

Not a product device and never shipped. Two device types share one implementation so the platform
can test both ways it runs a plugin:

* ``demo`` runs in the backend process and declares a 9-pin connector (for the wiring tests);
* ``demo_isolated`` runs in a child process.
"""

from __future__ import annotations

from typing import ClassVar, Literal

from sage_device_sdk import Pinout, function, single_connector_pinout

from .device import PNG, DemoDevice

# CN1 of the demo board: four outputs, two inputs, ground. Other positions are not connected.
FUNCTIONS = {
    1: (function("DO0", "output", "digital_logic", channel_kind="DO", channel_index=0),),
    2: (function("DO1", "output", "digital_logic", channel_kind="DO", channel_index=1),),
    3: (function("DO2", "output", "digital_logic", channel_kind="DO", channel_index=2),),
    4: (function("DO3", "output", "digital_logic", channel_kind="DO", channel_index=3),),
    6: (function("DI0", "input", "digital_logic", channel_kind="DI", channel_index=0),),
    7: (function("DI1", "input", "digital_logic", channel_kind="DI", channel_index=1),),
    9: (function("GND", "ground", "ground"),),
}


class PinnedDemo(DemoDevice):
    """``demo``: the demo device in the backend process, with a connector."""

    def pinout(self) -> Pinout:
        return single_connector_pinout(self.hardware_id, self.manufacturer, self.model, 9, FUNCTIONS,
                                       "SAGE demo board, test fixture")


class IsolatedDemo(DemoDevice):
    """``demo_isolated``: the demo device in a child process."""

    isolation: ClassVar[Literal["inproc", "subprocess"]] = "subprocess"


__all__ = ["FUNCTIONS", "PNG", "DemoDevice", "IsolatedDemo", "PinnedDemo"]
