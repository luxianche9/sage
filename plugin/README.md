# Hardware device plugins

霸天虎 V2 常用接口模型见 [`manuals/stm32-batianhu-v2/README.md`](manuals/stm32-batianhu-v2/README.md)。
新硬件适配器按技能 [`plugin/tools/skill/device-plugin`](../skill/device-plugin/SKILL.md) 编写。

Each hardware device is the device plugin SDK plus one adapter, loaded by the
SAGE backend as a plugin. The adapters under `adapters/` (see the stream table
below) are built from this directory; the board adapters of the earlier bench were removed
and new ones (RS-485 over USB, USB to DShot) will be added here. A release of SAGE ships
none of them: each adapter is delivered as a `.sagedev` device package and installed
on the bench page (+ → 添加设备…), which installs its driver and adds the device in one step.

```
sdk/                     sage_device_sdk: DeviceHost, plugin loading (in process or child
                         process), builtin tools, envelope, lifecycle, safe_state, streams (ring
                         buffer), /device manifest, waveform player, compliance suite
adapters/<adapter>/      sage_plugin_<adapter>: adapter.py, driver.py, sim.py, pinout.py, tests/
pack.py                  builds dist/<type>-<version>.sagedev device packages
test.ps1                 local tests: SDK, every adapter, dry-run compliance
```

## Device packages

```powershell
python pack.py --all        # tests + --check, wheel, manifest -> dist/*.sagedev
```

A package is a ZIP of `package.json` (type, version, manufacturer, model, isolation,
SDK range, vendor drivers, SHA-256 of every wheel) and `wheels/*.whl`. List the
vendor drivers the bench needs and the files that must be in the wheel under
`[tool.sage.package]` in the adapter's `pyproject.toml`.

Vendor DLLs shipped inside a package live in `src/<package>/bin/`, which git ignores;
copy them from the vendor delivery before `pack.py` (it refuses to build without them).

## Device plugins

An adapter package registers its `Device` subclass under the entry point group
`sage.devices`; the entry point name is the device type:

```toml
[project.entry-points."sage.devices"]
comm_link = "sage_plugin_comm_link:DEVICE"
```

The backend calls `open_device(type, config)`. `config` is a `DeviceConfig`, usually
built with `DeviceConfig.from_mapping({deviceId, hardwareId, manufacturer, model,
dryRun, settings})`; `settings` holds the adapter's nonsecret options. In the backend
a device instance is the record `{deviceId, label, hardwareId,
type, settings, enabled}` and always drives the real hardware; `dryRun` (the simulated
driver) is for the adapter's own tests and `--check` only.
`device_types()` lists the installed types, `load_device()` also accepts
`module` or `module:ClassName`.

`Device.isolation` decides where the device runs; both give the same async handle
(`start`, `stop`, `describe`, `call`, `read_stream`, `seek`, `watch`, `unwatch`,
`read_blob`, `safe_all`):

| `isolation` | Handle | Runs |
|---|---|---|
| `inproc` (default) | `InprocDevice` | a `DeviceHost` in the backend process |
| `subprocess` | `SubprocessDevice` | a `DeviceHost` in `python -m sage_device_sdk.child`, JSON lines over stdio; stdout noise of the driver goes to stderr, stdin EOF drives the device safe and exits, and on Windows the child dies with the backend |

`DeviceHost` holds one device, its lifecycle (open, `safe_state` after open and
before close, retry of a failed open), its tools and its streams. Tools are
described as plain dicts (`name`, `description`, `inputSchema`, `outputSchema`,
`annotations`, `_meta.sage`); `call(name, arguments, operation_id=)`
validates the arguments and returns the JSON envelope `{ok, data|error, meta}`.
`manifest()` is the generated `/device` declaration. `now_ms()` (`clock.py`) is the
shared clock of every record, watermark and tool timing.

## Simulation and dry-run

`"dryRun": true` in the config or `HARDWARE_DRY_RUN=1` makes `select_driver` pick
the adapter's simulator; nothing touches hardware and `/device.identity.dryRun` is
true. Simulation switches, all off by default so simulated inputs read idle values:

| Variable | Effect |
|---|---|
| `HARDWARE_DRY_RUN_AI_NOISE=1` | simulated analog inputs move |
| `HARDWARE_DRY_RUN_SERIAL_LOOPBACK=1` | serial TX is echoed back to RX |

## Test locally

```powershell
.\test.ps1                  # SDK tests, then every adapter's tests and dry-run compliance check
.\test.ps1 -Target sdk
.\test.ps1 -Target comm_link
uv run python -m sage_device_sdk --adapter comm_link --check   # compliance only
```

`--check` runs the compliance suite in process against the dry-run simulator: tool
contract and semantics, range rejection, `operationId` echo, streams (record format,
increasing `seq`/`t`, advancing watermark, idle-driven event streams), the `/device`
shape, revision and identity, and an idempotent `safe_state`. Adapter tests use
`sage_device_sdk.testing.serve(Device)`, which starts the host on a
background event loop: `hh.call("tool", **args)` returns the envelope, `hh.device()`
the declaration and `hh.subscribe(streamId)` reads a stream as `hello`, `batch`,
`gap` and `status` events.

## Device contract

Contract revision `2026-10-08.1`. Builtin tools: `get_device_info`, `list_hardware`,
`get_hardware_info`, `<prefix>_stream_read`, plus `<prefix>_transact` when a byte
stream has a writer, `<prefix>_blob_read` when a blob stream exists, `self_test` when
the device overrides `Device.self_test()`, and `sage_prepare_shutdown`. The declaration `{manifestRevision,
contractRevision, identity, description, pinout, streams, capabilities, tools[{name,
kind}]}` carries the pinout and the stream declarations; `manifestRevision` (sha256
over the canonical declaration) says when to read it again.

Every call may carry an `operationId` (tags the stream records it causes); the
result `meta` returns `operationId`, `timing` and `streamRefs`. Each device tool
declares `operationSemantics` explicitly. Devices report measurements and state; pass/fail
judging belongs to the test step, not the device. See
`plugin/tools/skill/device-plugin/references/contract.md` for the full contract and `streams.md` for
stream types and stream metadata.

Streams are read with `read_stream(streamId, cursor, limit, epoch)`: records
`{seq, t, op?, ...payload}`, `next`, a `watermark` (every record with `t` at or before
it has been returned) and a `gap` when records were evicted or the cursor came from
another epoch. `seek(streamId, since)` finds the first record at or after `since` (on
level streams the one still in force); sampled streams only sample while watched
(`watch`/`unwatch`).

Each stream declares its metadata in `/device.streams`: `unit`, `label`, `kind`
(`measured` or `setpoint`), `width`/`bitLabels` for bits, `rateHz` for sampled
streams, `writable` for byte streams. Byte and frame streams are idle-driven: the
reader thread calls `idle()` after every read return, so the watermark trails the
clock by at most one poll interval (`--check` verifies it).

| Adapter | Streams |
|---|---|
| `comm_link` (`isolation = "inproc"`) | `link` bytes, writable: RX and TX of one serial, TCP or UDP link, `mark` on connect/disconnect/clear |

### Self-test and acceptance

Users cannot read a plugin's code, so every delivered plugin proves itself in two steps.
`self_test` (builtin, reads only, never drives an external output) returns `{passed,
checks[{name, measured, expected, passed, detail}], durationMs, dryRun}`: identity,
driver version, channel counts, register readback, the sample rate a stream really
reaches, readings that must be in range. It shows that the plugin and the card agree.
What only wiring can show (an output voltage, a contact, a serial line) is the
"现场验收" section of each adapter README: a loopback or meter procedure the user runs
once on site, with the expected readings.

