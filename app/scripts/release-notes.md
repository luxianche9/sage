# SAGE {{version}}

## 文件

- `{{installer}}`：SAGE 安装程序（64 位 Windows，按用户安装，未签名）
- `SHA256SUMS.txt`：以上文件的 SHA-256

设备插件不在这里：每种设备单独交付一个 `.sagedev` 设备包，附带它需要的厂商驱动说明。

## 安装

1. 运行安装程序。安装程序未签名，Windows SmartScreen 提示时选“更多信息 → 仍要运行”。
2. 按设备包的说明，在台架电脑上装好这台设备需要的厂商驱动。
3. 打开 SAGE，在“测试台架”点“+ → 添加设备…”，选择这台设备的 `.sagedev`。
   弹窗显示设备、所需厂商驱动和 SHA-256；填名称，点“添加”，设备连接真实硬件后就能直接调用。

## 新增设备

新设备不需要重新安装 SAGE：按 `plugin/tools/skill/device-plugin` 写插件，用
`python plugin/tools/pack.py <插件>` 生成 `.sagedev`，用“添加设备…”添加即可。
驱动升级在重启 SAGE 后生效。

## 变更

{{changes}}
