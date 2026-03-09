import ollama from 'ollama'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import {
    REWRITE_MODEL,
    IMAGE_MODEL,
    CHAT_TIMEOUT_MS,
    GENERATE_TIMEOUT_MS,
} from './config.js'

// 通用超时包装
export function withTimeout(promise, ms, label) {
    let timeoutId
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms)
    })
    return Promise.race([
        promise.finally(() => clearTimeout(timeoutId)),
        timeout,
    ])
}

// magic bytes 判断图片格式
export function detectImageExtOrNull(buf) {
    if (buf.length >= 8) {
        if (
            buf[0] === 0x89 &&
            buf[1] === 0x50 &&
            buf[2] === 0x4e &&
            buf[3] === 0x47 &&
            buf[4] === 0x0d &&
            buf[5] === 0x0a &&
            buf[6] === 0x1a &&
            buf[7] === 0x0a
        )
            return 'png'
    }

    if (buf.length >= 3) {
        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
    }

    if (buf.length >= 12) {
        if (
            buf[0] === 0x52 &&
            buf[1] === 0x49 &&
            buf[2] === 0x46 &&
            buf[3] === 0x46 &&
            buf[8] === 0x57 &&
            buf[9] === 0x45 &&
            buf[10] === 0x42 &&
            buf[11] === 0x50
        )
            return 'webp'
    }

    return null
}

// 文件名安全化
export function safeBasename(s) {
    const trimmed = (s ?? '').trim()
    if (!trimmed) return 'image'
    return trimmed
        .slice(0, 60)
        .replaceAll(/\s+/g, '_')
        .replaceAll(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '')
        .replaceAll(/_+/g, '_')
}

// Qwen 润色提示词
export async function polishPrompt(point, rulesText) {
    const system = rulesText?.trim() ? rulesText.trim() : '(rules.md 中 QWEN_CHAT_SYSTEM 为空)'

    const res = await withTimeout(
        ollama.chat({
            model: REWRITE_MODEL,
            stream: false,
            think: false,
            format: 'json',
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: `point：${point}` },
            ],
        }),
        CHAT_TIMEOUT_MS,
        '润色提示词'
    )

    const raw =
        res?.message?.content ??
        res?.message?.thinking ??
        res?.response ??
        res?.content ??
        ''

    const text = String(raw).trim()
    if (!text) {
        const preview = JSON.stringify(res)?.slice(0, 2000) ?? ''
        throw new Error(`润色模型没有返回有效提示词（返回为空）。原始返回预览：${preview}`)
    }

    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const jsonText = text.slice(firstBrace, lastBrace + 1)
        try {
            const obj = JSON.parse(jsonText)
            const prompt = String(obj?.prompt ?? '').trim()
            if (prompt) return prompt
        } catch {
            // ignore
        }
    }

    return text
}

// 图像模型生成 base64
export async function generateImageBase64(prompt, system, inputImagesB64 = []) {
    const res = await withTimeout(
        ollama.generate({
            model: IMAGE_MODEL,
            prompt,
            system,
            images: Array.isArray(inputImagesB64) && inputImagesB64.length > 0 ? inputImagesB64 : undefined,
            stream: false,
        }),
        GENERATE_TIMEOUT_MS,
        '生成图片'
    )

    const candidates = [
        res?.images?.[0],
        res?.image,
        res?.response,
    ].filter((v) => typeof v === 'string')

    for (const s of candidates) {
        const trimmed = s.trim()
        if (!trimmed) continue
        try {
            const buf = Buffer.from(trimmed, 'base64')
            const ext = detectImageExtOrNull(buf)
            if (ext) return trimmed
        } catch {
            // ignore
        }
    }

    const preview = JSON.stringify(res)?.slice(0, 2000) ?? ''
    throw new Error(`图像模型没有返回可识别的图片 base64。原始返回预览：${preview}`)
}

// 释放模型资源
export async function stopModel(modelName) {
    try {
        console.log(`\n🧹 尝试释放模型资源：${modelName}`)

        const ps = spawnSync('ollama', ['ps'], { encoding: 'utf8' })
        if (ps.error) {
            console.warn(`⚠️ 执行 "ollama ps" 失败：${ps.error.message}`)
        } else {
            const out = (ps.stdout || '').trim()
            if (out) {
                console.log('📋 当前 ollama ps：\n' + out + '\n')
            } else {
                console.log('📋 当前没有正在运行的模型（ollama ps 输出为空）。\n')
            }
        }

        const stop = spawnSync('ollama', ['stop', modelName], { encoding: 'utf8' })
        if (stop.error) {
            console.warn(`⚠️ 执行 "ollama stop ${modelName}" 失败：${stop.error.message}`)
        } else if (typeof stop.status === 'number' && stop.status !== 0) {
            console.warn(
                `⚠️ "ollama stop ${modelName}" 退出码：${stop.status}，输出：\n${(stop.stdout || stop.stderr || '').trim()}\n`
            )
        } else {
            console.log(`✅ 已尝试停止模型：${modelName}\n`)
        }
    } catch (err) {
        console.warn(`⚠️ 释放模型 ${modelName} 资源时出错：`, err)
    }
}

