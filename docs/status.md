# 交接单

每次工作结束更新这份文件并提交。写**现在是什么状态、下一步做什么、已知问题**；已经定下的事写进 `docs/decisions/`，不写在这里。

最后更新：2026-11-23（开发机）

## 现在的状态

重构进行中，分支 `sage`（还不是 `main`）。已完成并通过全部软件检查：

| 提交 | 内容 |
|---|---|
| `b7dc1fe` | 恢复 12 个板卡插件、桥接程序、说明书 |
| `70209a9` | 目录调整：`sdk/`、`plugin/<名>/`、`plugin/tools/`、`docs/` |
| `40d7a03` | 改名为 SAGE（见 0001） |
| `ae64118` | 清理面板删除后留下的死代码 |
| `0778ed2` | 解耦：平台只依赖 SDK；测试插件 `sdk/demo_plugin`；平台发布只含安装包 |
| （本次） | `CLAUDE.md`、`docs/decisions/`、本交接单、`scripts/verify.ps1` |

检查结果（开发机）：前端 254 条测试、后端 759 条（覆盖率达标）、端到端 22 条、插件与 SDK 250 条（含合规检查）全部通过。

## 下一步

1. **切换主线**：`sage` 快进成 `main`；GitHub 仓库改名为 `sage`（用户在网页上操作）；重新 clone 到 `E:\Project\SAGE`。开发机 `E:\Project` 下旧名的仓库主目录（现在的 `SAGE` 文件夹只是它的一个工作树）先改名保留，等工控机跑通再删。旧分支已打归档标签（见 0005），删除前列清单给用户确认。
2. **工控机环境**：写 `scripts/setup.ps1`（uv、pnpm、Python 3.11、Electron 镜像），在两台工控机 clone 并跑 `.\scripts\verify.ps1 -Quick`。
3. **以后再做**（用户 2026-11-23：硬件准备不足）：实机测试框架 `lab/`（规则见 0004）、厂商 DLL 存放办法、开发机 USB 转串口试点。
4. **文档**：`docs/技术架构说明.md`（1248 行）按代码重写精简；PPT、Word、截图这类大文件以后不再提交。
5. **代码内部重构**：重构过程中记下的问题见下方，逐个和用户商量。

## 已知问题

- **Electron 下载会失败**（`pnpm install` 时报 ECONNRESET）。`pnpm install` 一旦决定重建 `node_modules`，会删掉已下载的 Electron。开发机上的做法：`ELECTRON_SKIP_BINARY_DOWNLOAD=1 pnpm install --config.confirmModulesPurge=false`，再把同版本（36.9.5）的 `dist/` 和 `path.txt` 复制到 `app/node_modules/.pnpm/electron@36.9.5/node_modules/electron/`。工控机上要用镜像（如设置 `ELECTRON_MIRROR`）或离线包。
- `pnpm install` 需要重建模块目录时会弹确认提示，非交互运行会卡住或中止；加 `--config.confirmModulesPurge=false`。
- `control-requests.ts` 里"把控件拖到画布"的请求现在没有接收方（接收它的控制面板随组件一起删了），重做组件时接上或删掉。
- `BenchPage.tsx` 里 `useMonitorWorkspace(undefined)` 的返回值没被使用，重做组件时确认是否还需要。
- 开发机的 Claude 记忆按旧仓库路径存放，换文件夹后读不到；该记的都已写进本仓库。

## 重构中记下的代码问题（待商量）

- `jcxd_mads3210` 有一条测试依赖时序，原分支上一直失败，已改为攒够采样点再判断（`b7dc1fe`）。其他插件测试里可能还有类似写法。
- SDK 当前 0.2.1，插件声明 `>=0.2,<0.3`；SDK 的版本策略（何时升小版本、大版本）还没定成文。
