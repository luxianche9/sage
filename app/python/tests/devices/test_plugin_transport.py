"""Device plugins loaded into the backend, using the SDK's demo device (sdk/demo_plugin) as the
plugin: ``demo`` runs in the backend process, ``demo_isolated`` in a child process. The platform
tests never depend on a product plugin."""

from __future__ import annotations

import asyncio
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from sage_device_sdk import DeviceConfig, DeviceHandle, open_device

from sage_backend.contracts.errors import AppError
from sage_backend.devices import (
    DeviceService,
    DeviceStore,
    PluginTransport,
)
from sage_backend.devices.plugin_transport import child_command, installed_device_types
from sage_backend.streams.clock import SHARED_CLOCK
from sage_backend.streams.source import StreamSources


def plugin(device_id: str, device_type: str, hardware_id: str) -> dict[str, Any]:
    return {
        "deviceId": device_id,
        "label": device_id,
        "hardwareId": hardware_id,
        "type": device_type,
        "settings": {},
    }


def simulated(device_type: str, config: DeviceConfig) -> DeviceHandle:
    """The plugin with ``dry_run`` set; the product never sets it (it always drives hardware)."""
    return open_device(device_type, replace(config, dry_run=True), child_command=child_command())


async def devices(
    tmp_path: Path, *devices: dict[str, Any]
) -> tuple[DeviceService, PluginTransport]:
    store = DeviceStore(tmp_path)
    await store.initialize()
    transport = PluginTransport(simulated)
    service = DeviceService(store, transport)
    for instance in devices:
        await service.save_device(instance)
        await service.refresh_device(instance["deviceId"])
    return service, transport


def test_installed_types_are_the_demo_plugins() -> None:
    types = {item["type"]: item for item in installed_device_types()}
    assert {"demo", "demo_isolated"} <= set(types)
    assert types["demo"]["isolation"] == "inproc"
    assert types["demo_isolated"]["isolation"] == "subprocess"
    assert types["demo"]["model"] == "DEMO-1"


async def test_an_inproc_plugin_serves_tools_declaration_and_streams(tmp_path: Path) -> None:
    service, transport = await devices(tmp_path, plugin("BOARD", "demo", "BOARD_HW"))
    try:
        names = {tool["externalName"] for tool in service.list_tools()}
        assert {"BOARD__demo_set_level", "BOARD__demo_safe_state"} <= names
        assert service.get_definition("BOARD_HW")["offline"] is False  # type: ignore[index]
        assert [item["hardwareId"] for item in await service.refresh_hardware()] == ["BOARD_HW"]
        assert {item["id"] for item in await service.list_streams("BOARD_HW")} >= {"do", "di"}

        sources = StreamSources(transport.device_for)
        assert sources.clock("BOARD_HW") is SHARED_CLOCK
        source = sources.source("BOARD_HW", "do", since=0.0)
        events = source.events()
        assert (await anext(events))["type"] == "hello"

        result = await service.call_aggregated_tool(
            "BOARD__demo_set_level",
            {"channel": 3, "level": True},
            {"envelope": True, "operationId": "op-1"},
        )
        assert result["meta"]["operationId"] == "op-1"
        while True:
            event = await asyncio.wait_for(anext(events), 5)
            if event["type"] == "batch" and any(r["mask"] & 0b1000 for r in event["records"]):
                break
        assert all(record["tb"] == record["t"] for record in event["records"])
        await events.aclose()  # type: ignore[attr-defined]

        with pytest.raises(AppError) as failure:
            await service.call_aggregated_tool("BOARD__demo_set_level", {"channel": 99})
        assert failure.value.category == "invalid_argument"
        await service.safe_all()
        state = await service.call_aggregated_tool("BOARD__demo_read_level", {"channel": 3})
        assert state["level"] is False
    finally:
        await transport.close()


async def test_an_isolated_plugin_runs_in_a_child_process(tmp_path: Path) -> None:
    service, transport = await devices(tmp_path, plugin("ISO", "demo_isolated", "ISO_HW"))
    try:
        device = transport.device_for("ISO_HW")
        assert device is not None and device.isolation == "subprocess"
        await service.call_aggregated_tool("ISO__demo_set_level", {"channel": 2, "level": True})
        read = await device.read_stream("do", 0, 50)
        assert read["records"][-1]["mask"] == 0b100
        await service.safe_all()
        assert (await device.read_stream("do", 0, 50))["records"][-1]["mask"] == 0
    finally:
        await transport.close()
    assert device.process is None  # type: ignore[attr-defined]


async def test_a_dead_device_process_is_an_unknown_outcome(tmp_path: Path) -> None:
    service, transport = await devices(tmp_path, plugin("ISO", "demo_isolated", "ISO_HW"))
    try:
        device: Any = transport.device_for("ISO_HW")
        device.process.kill()
        await device.process.wait()
        with pytest.raises(AppError) as failure:
            await service.call_aggregated_tool("ISO__demo_set_level", {"channel": 0, "level": True})
        assert failure.value.category == "unavailable"
        assert failure.value.details["outcomeKnown"] is False
    finally:
        await transport.close()


async def test_an_instance_of_an_uninstalled_type_says_so(tmp_path: Path) -> None:
    service, transport = await devices(tmp_path, plugin("GONE", "removed_card", "GONE_CARD"))
    [status] = service.list_device_statuses()
    assert status["transport"]["state"] != "online"
    assert "removed_card is not installed" in status["transport"]["message"]


async def test_connecting_gives_the_hardware_the_plugin_s_connector_pins(tmp_path: Path) -> None:
    service, transport = await devices(tmp_path, plugin("BOARD", "demo", "BOARD_HW"))
    try:
        hardware = service.store.require_hardware("BOARD_HW")
        [port] = hardware["ports"]
        assert (hardware["label"], port["name"], len(port["pins"])) == ("BOARD", "CN1", 9)
        assert port["pins"][0] == {"pinId": "BOARD_HW.CN1.1", "position": 1, "label": "DO0"}
    finally:
        await transport.disconnect("BOARD")
