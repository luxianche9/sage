"""The demo device now lives in the installable test plugin ``sage_plugin_demo`` (sdk/demo_plugin);
the SDK tests keep importing it, and loading ``sdk_demo:DemoDevice``, by this name."""

from sage_plugin_demo.device import PNG, DemoDevice

__all__ = ["PNG", "DemoDevice"]
