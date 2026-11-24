# 交接单

每次工作结束更新这份文件并提交。写**现在是什么状态、下一步做什么、已知问题**；已经定下的事写进 `docs/decisions/`，不写在这里。

最后更新：2026-11-24（开发机）

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

检查结果（开发机，2026-11-24 用 `scripts/setup.ps1` 装好后）：前端 254 条测试（desktop 245 + contracts 9）、后端 759 条（覆盖率达标）、端到端 22 条、插件与 SDK 250 条（含合规检查）全部通过。setup 在开发机上验证过：Electron 修复（挪走 `dist` 后重跑，解出的文件与原来逐个一致）、重复运行时各步跳过；uv 的下载安装只单独试过下载和解压（开发机已有 uv），完整安装路径要在工控机上第一次跑时确认。

## 下一步

1. **工控机环境**：`scripts/setup.ps1` 已写好（2026-11-24，开发机上验证通过，见下）。在两台工控机上：装 Git 和 Node.js（20 以上，从 npmmirror 下 .msi），clone 到 `E:\Project\sage`，执行 `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1`（装好后自动跑 `verify.ps1 -Quick`）。工控机上第一次跑若出问题，按规则 4 开 `fix/<机器>-setup` 分支。
2. **以后再做**（用户 2026-11-23：硬件准备不足）：实机测试框架 `lab/`（规则见 0004）、厂商 DLL 存放办法、开发机 USB 转串口试点、虚拟实验室（见 0005）。
3. **文档**：`docs/技术架构说明.md`（1248 行）按代码重写精简；PPT、Word、截图这类大文件以后不再提交。
4. **代码内部重构**：见下方记下的问题，逐个和用户商量。
5. **界面重排（讨论中，先不改代码）**：2026-11-24 用户反映界面别扭——流程编辑在弹窗里、点运行历史会跳走、上位机和运行监控挤在一起、协议（ICD）编辑藏在设备管理里、接线有两层开关。原因是整个软件只有"测试台架"一页，左侧图标只换侧栏，中间另有一个开关。**用户已定：每页最多两栏（左栏 + 中间），右边留给 AI 助手，不要右侧属性栏。** 当前方案：左侧图标改成真正的页面导航，六页——设备（列表｜详情，收掉设备信息、编辑、手动操作、自检几个弹窗）、接线（接线清单｜画布，去掉画布/列表开关和右侧属性栏）、协议（文件列表｜编辑器）、流程（步骤卡片｜流程）、运行（步骤进度｜上位机画布 + 时间轴；编辑布局时左栏换成组件库和控件属性）、记录（运行列表，选中后换成该次的步骤｜只读回放画布）。属性一律就地展开或放左栏。画布仍是单页、不弹独立窗口（见 0005）。用户确认后写成 `docs/decisions/0006` 再动手，每步一次提交。

## 已知问题

- GitHub 上只剩 `main`：6 个旧分支已于 2026-11-24 删除，内容都在 `archive/*` 标签里（见 0005）。工控机上若还有这些分支的本地副本，`git fetch --prune` 后可删。

- GitHub 仓库已改名为 `sage`（2026-11-24），开发机已改远端地址；**两台工控机还要执行** `git remote set-url origin https://github.com/luxianche9/sage.git`（不改也能用，GitHub 会跳转）。

- **Electron 在 Node 24 上解压不完整**：`pnpm install` 时 Electron 自己的安装脚本从镜像下载成功（缓存在 `%LOCALAPPDATA%\electron\Cache\`，校验和与官方一致），但解压只解出第一个文件就退出且不报错，结果是 `dist/` 只有 `locales`，运行时报 "Electron failed to install correctly"。处理：用 Windows 自带的 tar 解压缓存里的 zip 到 `app/node_modules/.pnpm/electron@36.9.5/node_modules/electron/dist/`，再写 `path.txt`（内容 `electron.exe`）。`scripts/setup.ps1` 会自动检查并重做这一步。
- `pnpm install` 需要重建模块目录时会弹确认提示，非交互运行会卡住或中止；加 `--config.confirmModulesPurge=false`。重建会删掉已解压的 Electron，之后要重做上一条（重跑 `setup.ps1` 即可）。
- 清华 PyPI 镜像在开发机上 TLS 握手失败，所以用阿里云；腾讯、华为镜像也可用。
- `control-requests.ts` 里"把控件拖到画布"的请求现在没有接收方（接收它的控制面板随组件一起删了），重做组件时接上或删掉。
- `BenchPage.tsx` 里 `useMonitorWorkspace(undefined)` 的返回值没被使用，重做组件时确认是否还需要。
- 开发机的 Claude 记忆按文件夹路径存放；该记的都已写进本仓库，以仓库为准。

## 重构中记下的代码问题（待商量）

- `jcxd_mads3210` 有一条测试依赖时序，原分支上一直失败，已改为攒够采样点再判断（`b7dc1fe`）。其他插件测试里可能还有类似写法。
- SDK 当前 0.2.1，插件声明 `>=0.2,<0.3`；SDK 的版本策略（何时升小版本、大版本）还没定成文。
- 边界检查只认带引号的完整插件名，平台测试里还有十来处 `"pci1762"`、`"pci1710l"` 这类字符串当测试数据（不加载插件）；可以逐步换成 `demo`。两个检查脚本按目录名跳过 `run`、`logs`、`output` 等，以后若有同名源码目录会漏检。
- 写插件的技能放在 `plugin/tools/skill/`，不是 Claude 的 `.claude/skills/`，新会话靠 `CLAUDE.md` 指路才会用到；要不要挪过去待定。
