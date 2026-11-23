"""SAGE device plugin for the ART Technology PXI2355L (entry point ``sage.devices``)."""

from .adapter import ArtPxi2355l

DEVICE = ArtPxi2355l

__all__ = ["DEVICE", "ArtPxi2355l"]
