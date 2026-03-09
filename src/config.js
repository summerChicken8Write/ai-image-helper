import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

// 配置由原 config.json 合并而来
const appConfig = {
    models: {
        // 用于润色 point 的 chat 模型名称
        rewrite: 'lukey03/qwen3.5-9b-abliterated-vision:latest',
        // 用于生成图片的 generate 模型名称
        image: 'x/z-image-turbo:fp8',
    },
    paths: {
        // 规则文件（system / rules）路径
        rules: './rules.md',
        // 生成图片与 metadata.json 存放目录
        imagesDir: './images',
    },
    timeouts: {
        // Qwen 润色提示词的超时时间（毫秒）
        chatMs: 60000,
        // 图像模型生成图片的超时时间（毫秒）
        generateMs: 600000,
    },
}

const models = appConfig.models
const timeouts = appConfig.timeouts
const paths = appConfig.paths

export const REWRITE_MODEL = models.rewrite
export const IMAGE_MODEL = models.image

export const CHAT_TIMEOUT_MS = Number.parseInt(timeouts.chatMs, 10)
export const GENERATE_TIMEOUT_MS = Number.parseInt(timeouts.generateMs, 10)

export const RULES_PATH = path.resolve(PROJECT_ROOT, paths.rules)
export const IMAGES_DIR = path.resolve(PROJECT_ROOT, paths.imagesDir)
export const METADATA_PATH = path.join(IMAGES_DIR, 'metadata.json')
