# 交接单

每次工作结束更新这份文件并提交。写**现在是什么状态、下一步做什么、已知问题**；已经定下的事写进 `docs/decisions/`，不写在这里。

最后更新：2026-11-23（开发机）

## 现在的状态

重构完成，全部在 `main`。开发机上仓库在 `E:\Project\sage`（从 GitHub 重新 clone，按国内镜像从零装好依赖后，`.\scripts\verify.ps1` 全部通过）。旧的两个文件夹和重构备份挪进了 `E:\Project\归档\`。版本 0.3.0（尚未发布，变化见 `CHANGELOG.md`）。

| 提交 | 内容 |
|---|---|
| `b7dc1fe` | 恢复 12 个板卡插件、桥接程序、说明书 |
| `70209a9` | 目录调整：`sdk/`、`plugin/<名>/`、`plugin/tools/`、`docs/` |
| `40d7a03` | 改名为 SAGE（见 0001） |
| `ae64118` | 清理面板删除后留下的死代码 |
| `0778ed2` | 解耦：平台只依赖 SDK；测试插件 `sdk/demo_plugin`；平台发布只含安装包 |
| `39d796a` | `CLAUDE.md`、`docs/decisions/`、本交接单、`scripts/verify.ps1` |
| `89ea297` | 依赖下载全部走国内镜像 |
| `5250bf2` | 按 Fable 5.2 审核修正：SDK 测试改用演示插件、边界检查覆盖 SDK、技能与 README 命令、版本升 0.3.0 与 CHANGELOG、插件 README 加"实机验证状态" |

检查结果（开发机，全新 clone）：前端 257 条测试（desktop 248 + contracts 9）、后端 759 条（覆盖率达标）、端到端 22 条、插件与 SDK 250 条（含合规检查）全部通过。

## 下一步

1. **GitHub 仓库改名**：GitHub 上仓库还是旧名，用户在网页上改成 `sage`，然后本机执行 `git remote set-url origin https://github.com/luxianche9/sage.git`（不改也能用，GitHub 会自动跳转）。
2. **旧分支**：GitHub 上还有 `feat/hmi-builder`、`sage`、`monitor-panel`、`signal-view`、`run-monitor-transparency`、`ai-devkit`，都已打归档标签（见 0005），本地新 clone 只有 `main`。删远端分支前列清单给用户确认。
3. **工控机环境**：写 `scripts/setup.ps1`（uv、pnpm 走 npmmirror 安装而不是 corepack、Python 3.11、Electron 的解压问题见下），在两台工控机 clone 到 `E:\Project\sage` 并跑 `.\scripts\verify.ps1 -Quick`。
4. **以后再做**（用户 2026-11-23：硬件准备不足）：实机测试框架 `lab/`（规则见 0004）、厂商 DLL 存放办法、开发机 USB 转串口试点、虚拟实验室（见 0005）。
5. **文档**：`docs/技术架构说明.md`（1248 行）按代码重写精简；PPT、Word、截图这类大文件以后不再提交。
6. **代码内部重构**：见下方记下的问题，逐个和用户商量。

## 已知问题

- **Electron 在 Node 24 上解压不完整**：`pnpm install` 时 Electron 自己的安装脚本从镜像下载成功（缓存在 `%LOCALAPPDATA%\electron\Cache\`，校验和与官方一致），但解压只解出第一个文件就退出且不报错，结果是 `dist/` 只有 `locales`，运行时报 "Electron failed to install correctly"。处理：用 Windows 自带的 tar 解压缓存里的 zip 到 `app/node_modules/.pnpm/electron@36.9.5/node_modules/electron/dist/`，再写 `path.txt`（内容 `electron.exe`）。`setup.ps1` 要自动做这一步。
- `pnpm install` 需要重建模块目录时会弹确认提示，非交互运行会卡住或中止；加 `--config.confirmModulesPurge=false`。重建会删掉已解压的 Electron，之后要重做上一条。
- 清华 PyPI 镜像在开发机上 TLS 握手失败，所以用阿里云；腾讯、华为镜像也可用。
- `control-requests.ts` 里"把控件拖到画布"的请求现在没有接收方（接收它的控制面板随组件一起删了），重做组件时接上或删掉。
- `BenchPage.tsx` 里 `useMonitorWorkspace(undefined)` 的返回值没被使用，重做组件时确认是否还需要。
- 开发机的 Claude 记忆按文件夹路径存放；该记的都已写进本仓库，以仓库为准。

## 重构中记下的代码问题（待商量）

- `jcxd_mads3210` 有一条测试依赖时序，原分支上一直失败，已改为攒够采样点再判断（`b7dc1fe`）。其他插件测试里可能还有类似写法。
- SDK 当前 0.2.1，插件声明 `>=0.2,<0.3`；SDK 的版本策略（何时升小版本、大版本）还没定成文。
- 边界检查只认带引号的完整插件名，平台测试里还有十来处 `"pci1762"`、`"pci1710l"` 这类字符串当测试数据（不加载插件）；可以逐步换成 `demo`。两个检查脚本按目录名跳过 `run`、`logs`、`output` 等，以后若有同名源码目录会漏检。
- 写插件的技能放在 `plugin/tools/skill/`，不是 Claude 的 `.claude/skills/`，新会话靠 `CLAUDE.md` 指路才会用到；要不要挪过去待定。
