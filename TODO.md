# TODO

目标：把扩展发布到 VS Code Marketplace，并让用户可以在扩展市场中搜索到。

## 必做

- [ ] 创建 Visual Studio Marketplace publisher
  - 需要先确定最终使用的 publisher ID
  - 发布前必须把 `publisher` 写入 `package.json`

- [ ] 创建 Azure DevOps PAT
  - 用于 `vsce` 登录和发布
  - 所需权限：`Marketplace > Manage`

- [ ] 在 `package.json` 中补齐发布必需和检索相关元数据
  - [ ] 添加 `publisher`
  - [ ] 检查 `displayName` 是否改成更适合搜索和展示的名字
  - [ ] 优化 `description`
  - [ ] 添加 `keywords`
  - [ ] 调整 `categories`
  - [ ] 添加 `icon`

- [ ] 准备扩展图标
  - 建议使用至少 128x128 的 PNG
  - 路径示例：`media/icon.png`

- [ ] 本地打包检查
  - [ ] `npm install`
  - [ ] `npm run compile`
  - [ ] `npx @vscode/vsce package`
  - [ ] 确认生成的 `.vsix` 可以本地安装

- [ ] 登录 publisher
  - 命令：`npx @vscode/vsce login <publisher-id>`

- [ ] 发布扩展
  - 命令：`npx @vscode/vsce publish`
  - 或先生成 `.vsix` 后手动上传

## 为了更容易被搜索到

- [ ] 把核心搜索词写进 `displayName`、`description`、`README`
  - 建议覆盖这些词：`Guitar Pro`、`MusicXML`、`tablature`、`tab`、`score`

- [ ] 在 `keywords` 中补充常见文件格式和用户搜索词
  - 例如：`gp5`、`gp7`、`gp8`、`gpx`、`mxl`、`sheet music`

- [ ] 检查 README 开头是否足够直接说明用途
  - 用户应一眼看出这个扩展可以打开、渲染、播放 Guitar Pro / MusicXML

## 发布后确认

- [ ] 在 Marketplace 网页端确认扩展公开可见
- [ ] 在 VS Code 扩展视图中用关键词搜索验证
- [ ] 检查扩展详情页的图标、README、截图和链接是否正常

## 备注

- 当前仓库已具备 README、CHANGELOG、LICENSE、repository、homepage、bugs 等基础发布信息。
- 当前主要阻塞项是 `package.json` 缺少 `publisher`，且还没有 `icon` 和 `keywords`。
