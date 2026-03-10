# ai-image-helper

一个基于 [Ollama](https://ollama.com/) 的本地图片生成小工具：输入一个 **point**，先用对话模型润色成更完整的提示词，再用图像模型生成图片并保存到本地；同时支持基于历史图片继续调优生成、删除记录，以及在 **iTerm2** 中用 `imgcat` 直接预览图片。

## 功能

- **文本 -> 提示词润色 -> 生成新图片**
- **基于历史图片继续调优**：选择历史图片作为参考图，并复用/再润色提示词
- **删除历史图片及提示词记录**
- **终端预览图片**：仅在 **iTerm2** 下通过 `imgcat` 预览（其他终端会提示并输出图片路径）

## 环境要求

- **Node.js**：建议 18+（项目为 ESM：`"type": "module"`）
- **Ollama**：本机已安装并可使用 `ollama` 命令
- **iTerm2（可选）**：需要终端内预览时使用
- **imgcat（可选）**：iTerm2 的图片显示命令

## 安装

```bash
npm install
```

## 配置

项目使用以下默认路径与模型（可在 `src/config.js` 修改）：

- **规则文件**：`./rules.md`
- **图片与元数据目录**：`./images`
- **润色模型**：`lukey03/qwen3.5-9b-abliterated-vision:latest`
- **图像模型**：`x/z-image-turbo:fp8`

首次运行前请准备 `rules.md`（缺失会报错）。脚本会读取其中的规则来构建 system prompt。

### 拉取模型（示例）

按你的 `src/config.js` 配置，先确保模型已在本机可用，例如：

```bash
ollama pull "lukey03/qwen3.5-9b-abliterated-vision:latest"
ollama pull "x/z-image-turbo:fp8"
```

## 运行

入口文件是根目录的 `index.js`：

```bash
node index.js
```

运行后会出现菜单：

```text
1) 文本 -> 提示词润色 -> 生成新图片
2) 基于历史图片的提示词/参考图继续调优生成
3) 删除某张图片及其提示词记录
4) 预览已有图片
```

说明：

- **选项 1**：输入 point -> 自动润色 -> 你可再手动编辑 -> 回车生成 -> 保存图片与元数据
- **选项 2**：从历史记录中选一张作为参考图 -> 选择“手动编辑提示词”或“根据新 point 再润色” -> 生成新图
- **选项 3**：按编号删除图片文件与对应的提示词记录（需输入 `yes` 二次确认）
- **选项 4**：按编号选择一张历史图片进行终端预览

## 终端预览（iTerm2 + imgcat）

### 预览新生成图片

图片生成并保存后，脚本会询问：

```text
🖼️ 是否在终端中预览新生成的图片？(y/N)：
```

输入 `y` 即会尝试运行：

```bash
imgcat "<图片路径>"
```

### 预览历史图片

在主菜单选择 **4**，按编号选择图片即可。

### 非 iTerm2 的行为

如果当前终端不是 iTerm2，脚本不会执行 `imgcat`，而是提示：

- 预览仅在 iTerm2 可用
- 并输出图片文件路径，便于你手动打开/复制路径

### imgcat 未找到

如果你在 iTerm2 中选择预览但提示 `imgcat` 调用失败，通常是 `imgcat` 不在 `PATH`：

- 确认 iTerm2 已安装 `imgcat`（或通过 iTerm2 的 Shell Integration / 工具包提供）
- 确认你的 shell 环境变量 `PATH` 中包含 `imgcat`

## 输出文件

- **图片目录**：`./images`
- **元数据**：`./images/metadata.json`
- 文件名格式：`<ISO时间戳>_<point安全化>.<png/jpg/webp>`

## 常见问题（FAQ）

### 1）提示“未找到规则文件 rules.md”

需要在项目根目录创建 `rules.md`。脚本会读取其中内容来生成 system prompt。

### 2）生成超时 / 生成很慢

超时在 `src/config.js` 里：

- `chatMs`：润色提示词超时
- `generateMs`：生成图片超时

也可以更换更快的模型或降低提示词复杂度。

