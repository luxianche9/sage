# 设备插件目录（给 Claude）

全仓规则见上一级 `CLAUDE.md`；这里只写插件特有的。

- **一个插件一个文件夹**，自成一体：`README.md`（接线、配置、已知问题、实机验证状态）、`pyproject.toml`（版本号和 SDK 范围）、`src/sage_plugin_<名>/`、`tests/`、可选的 `native/`（它自己的桥接程序源码）和 `manuals/`（说明书和针脚页说明）。共用的东西只放 `tools/`。
- **只依赖 SDK**：不 import `sage_backend`，不引用 `@sage/*`（`pnpm check:boundaries` 会拦）。
- **新插件用脚手架**：`python tools\skill\device-plugin\scripts\new_device.py ...`，然后按 `tools/skill/device-plugin/SKILL.md` 填。完成标准：`tools\skill\device-plugin\scripts\check_adapter.ps1 -Adapter <名>` 通过（测试 + 合规检查 + 没有遗留 TODO）。
- **模拟驱动**（`sim.py`）只模拟控制器状态，不编造测量值：输入读成空闲值（0 V、低电平、无数据）。测试和 `--check` 用它；产品里设备永远驱动真实硬件。
- **厂商 DLL 和编译出的桥接程序放 `src/<包>/bin/`，git 忽略它们**；`pyproject.toml` 的 `[tool.sage.package] requiredFiles` 列出必需的文件，缺了 `pack.py` 拒绝打包。桥接程序用 `tools/native/build.py`（MinGW，DAQNavi）或 `build_x86.py`（MSVC x86）编译。
- **版本**：改了插件就在它的 `pyproject.toml` 里升版本；插件声明它需要的 SDK 范围（如 `sage-device-sdk>=0.2,<0.3`），SDK 改坏旧接口时升大版本。
- **还没有任何插件上过实机**（2026-11）。上实机前读 `docs/decisions/0004-多机工作流.md` 的安全规则。

```powershell
uv sync
.\tools\test.ps1 -Target <名>                 # 一个插件；不带参数 = SDK + 全部插件
uv run python tools\pack.py <名>              # -> dist\<名>-<版本>.sagedev
```
