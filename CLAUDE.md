# SAGE 仓库说明（给 Claude）

SAGE 是单机测试台架软件：一台 Windows 电脑上，桌面程序管理设备、接线、测试计划、运行与判定；每种硬件是一个设备插件，以 `.sagedev` 设备包单独交付。平台和插件**分别打包、分别交付给客户**。产品曾名 testStand（与 NI TestStand 撞名，2026-11 改名；还没交付过，不保留旧名兼容）。

开始工作前先读：`docs/status.md`（交接单：正在做什么、下一步）和 `docs/decisions/`（已定的事和原因，不要重新提已否决的方案）。

## 用户

用户没有嵌入式背景：术语用白话解释，协议问题配字节示例。用中文交流。

## 目录

| 路径 | 内容 |
|---|---|
| `app/` | **平台**：Electron 桌面（`apps/desktop`）、共享契约（`packages/contracts`）、Python 后端（`python`，包 `sage_backend`） |
| `sdk/` | 设备 SDK `sage_device_sdk`：平台和插件之间**唯一**的约定；`sdk/demo_plugin` 是只用于测试的演示插件 |
| `plugin/<名>/` | **设备插件**，一个文件夹一个，自带 README、源码、测试、`native/` 桥接程序、`manuals/` 说明书 |
| `plugin/tools/` | 插件共用：`pack.py` 打设备包、`test.ps1` 测试、`native/` 公共头文件与编译脚本、`skill/` 写插件的技能 |
| `docs/` | `status.md` 交接单、`decisions/` 决定记录、`hardware/` 被测件资料、`技术架构说明.md`（部分过时，待重写） |
| `scripts/verify.ps1` | 全仓软件检查 |

## 硬规则

1. **依赖方向 `app -> sdk <- plugin`**。平台代码不出现任何产品插件的名字或设备类型；插件和 SDK 不引用 `sage_backend`、`@sage/*`。`pnpm check:boundaries` 会拦。平台测试用 `sdk/demo_plugin` 的 `demo` / `demo_isolated`。
2. **合并到 `main` 前跑 `.\scripts\verify.ps1` 全部通过**。没有 CI，这条靠自觉。
3. **命名一律 SAGE**：包 `sage_*`、入口点组 `sage.devices`、设备包 `.sagedev`、硬件定义 `.sagehw`。`pnpm check:branding` 禁止旧名（`CHANGELOG.md` 和 `docs/decisions/` 里的历史记述除外）。不要建顶层 Python 包 `sage`（与 SageMath 撞名）。
4. **测试电脑（工控机）上不在 `main` 上提交**：只 `git pull --ff-only`；修 bug 开 `fix/<机器>-…` 分支推上去，回开发机合并。
5. **会让硬件动作的操作，结束时恢复安全状态**；设备都直接驱动真实硬件，实机测试的规则见 `docs/decisions/0004-多机工作流.md`。
6. **每次工作结束更新 `docs/status.md`** 并提交，换会话、换电脑都靠它接上。
7. **所有下载走中国镜像**（三台电脑都在国内）：npm、Electron、electron-builder 走 npmmirror（`app/.npmrc`），PyPI 走阿里云、uv 下载 Python 走 npmmirror（`app/python/pyproject.toml`、`plugin/pyproject.toml` 的 `[tool.uv]`）。清华源在开发机上连不上。新增会下载东西的工具时同样配镜像。

## 常用命令

```powershell
# 平台（在 app/ 下）
pnpm install; pnpm python:setup   # 装依赖（走国内镜像，见规则 7）
pnpm dev                          # 开发模式启动；设备类型列表里只有演示插件 demo / demo_isolated
pnpm verify; pnpm verify:python; pnpm test:e2e

# 插件（在 plugin/ 下）
uv sync
.\tools\test.ps1 [-Target <插件名>|sdk]       # pytest + 合规检查（模拟驱动，不碰硬件）
uv run python tools\pack.py <插件名>          # -> plugin\dist\<名>-<版本>.sagedev

# 新插件
python plugin\tools\skill\device-plugin\scripts\new_device.py <名> --prefix <前缀> --model <型号> --manufacturer <厂商>
```

在开发模式里试一个真实插件：先在 `plugin/` 下打出它的 `.sagedev`，再在 SAGE 界面"+ → 添加设备…"选它（和客户的安装路径一样）。

## 三台电脑

| 电脑 | 用途 |
|---|---|
| 开发机（本机，插 USB 设备） | 主要开发；软件测试；USB 设备的实机测试 |
| 工控机1（4 块板卡） | 实机测试、现场排查 |
| 工控机2（≥8 块板卡） | 实机测试、现场排查 |

厂商 DLL 不在 git 里（`plugin/*/src/*/bin/` 被忽略），目前在其中一台工控机上，存放办法待定。

GitHub 只用来同步代码，不跑自动化测试。实机测试框架（`lab/`）还没做，见 `docs/status.md`。
