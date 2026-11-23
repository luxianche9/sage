"""SAGE device plugin: a link over the PC's COM port, TCP or UDP (entry point ``sage.devices``)."""

from .adapter import CommLink

DEVICE = CommLink

__all__ = ["DEVICE", "CommLink"]
