import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { spawn } from 'node:child_process'
import { stdin as input, stdout as output } from 'node:process'
import { detectImageExtOrNull, safeBasename, polishPrompt, generateImageBase64, stopModel } from './llm_models.js'
import { buildSystemsFromRules } from './rules_loader.js'
import { maybeEditPrompt } from './prompt_edit.js'
import { listImageRecords, addImageRecord, deleteImageRecordById } from './image_store.js'
import { RULES_PATH, IMAGES_DIR, REWRITE_MODEL, IMAGE_MODEL } from './config.js'

export async function main() {
    await fs.mkdir(IMAGES_DIR, { recursive: true })

    // 读取规则文件（用于提供 system prompt / rules）
    let rulesMd = ''
    try {
        rulesMd = await fs.readFile(RULES_PATH, 'utf8')
    } catch {
        throw new Error(`未找到规则文件：${RULES_PATH}（请先创建 rules.md）`)
    }

    const {
        globalRules,
        qwenSystemRaw,
        imageSystemRaw,
        qwenSystem,
        imageSystem,
    } = buildSystemsFromRules(rulesMd)

    const rl = readline.createInterface({ input, output })
    try {
        console.log('📜 已加载 rules.md，将使用以下规则：\n')
        if (globalRules) console.log('🌍 GLOBAL_RULES：\n' + globalRules + '\n')
        console.log('🧠 Qwen(chat) system（实际发送）：\n' + qwenSystem + '\n')
        console.log('🖼️  Image(generate) system（实际发送）：\n' + imageSystem + '\n')

        // 读取已有图片元数据（带提示词）
        const records = await listImageRecords()

        console.log('🔢 请选择工作模式：')
        console.log('  1) 文本 -> 提示词润色 -> 生成新图片')
        if (records.length > 0) {
            console.log('  2) 基于历史图片的提示词/参考图继续调优生成')
            console.log('  3) 删除某张图片及其提示词记录')
            console.log('  4) 预览已有图片')
        } else {
            console.log('  2) （当前没有带元数据的图片，暂不可用）')
            console.log('  3) （当前没有带元数据的图片，暂不可用）')
            console.log('  4) （当前没有带元数据的图片，暂不可用）')
        }
        const modeRaw = (await rl.question('👉 输入 1 / 2 / 3 / 4（直接回车默认 1）：')).trim()
        const hasRecords = records.length > 0
        const mode =
            modeRaw === '2' && hasRecords ? 2 : modeRaw === '3' && hasRecords ? 3 : modeRaw === '4' && hasRecords ? 4 : 1

        if (mode === 4) {
            await previewExistingImage(records, rl)
            return
        }

        if (mode === 3) {
            console.log('\n🗑️ 可删除的图片记录：')
            records.forEach((r, idx) => {
                const shortPrompt = (r.prompt || '').slice(0, 40)
                console.log(`[${idx + 1}] ${r.filename} \n    point: ${r.point || '-'} \n    prompt: ${shortPrompt || '-'}${shortPrompt.length === 40 ? '...' : ''}`)
            })
            const delRaw = (await rl.question('👉 请输入要删除的编号（直接回车取消）：')).trim()
            if (!delRaw) return
            const delIdx = Number.parseInt(delRaw, 10)
            if (!Number.isFinite(delIdx) || delIdx < 1 || delIdx > records.length) {
                console.log('⚠️  编号不合法，退出。')
                return
            }
            const rec = records[delIdx - 1]
            const confirm = (
                await rl.question(
                    `⚠️  确认删除？这会删除图片文件与提示词记录。\n   文件：${rec.filename}\n   point：${
                        rec.point || '-'
                    }\n   prompt：${(rec.prompt || '').slice(0, 60) || '-'}\n请输入 "yes" 确认：`
                )
            ).trim()
            if (confirm !== 'yes') {
                console.log('已取消删除。')
                return
            }
            await deleteImageRecordById(rec.id)
            console.log('✅ 已删除所选记录。')
            return
        }

        let referenceImageB64 = null
        let referenceFilename = null
        let point = ''
        let initialPromptForEdit = ''

        if (mode === 1) {
            point = (await rl.question('👉 请输入一个 point（直接回车退出）：')).trim()
            if (!point) return

            console.log('\n🧠 正在润色提示词...')
            const polished = await polishPrompt(point, qwenSystem)
            console.log('✅ 润色结果：\n' + polished + '\n')
            initialPromptForEdit = polished
        } else {
            console.log('\n🖼️ 可用于调优的历史图片（带提示词记录）：')
            records.forEach((r, idx) => {
                const shortPrompt = (r.prompt || '').slice(0, 40)
                console.log(
                    `  [${idx + 1}] ${r.filename}  point: ${r.point || '-'}  prompt: ${
                        shortPrompt || '-'
                    }${shortPrompt.length === 40 ? '...' : ''}`
                )
            })
            const idxRaw = (await rl.question('👉 请输入要作为参考图的编号（直接回车取消）：')).trim()
            if (!idxRaw) return
            const idx = Number.parseInt(idxRaw, 10)
            if (!Number.isFinite(idx) || idx < 1 || idx > records.length) {
                console.log('⚠️  编号不合法，退出。')
                return
            }
            const chosen = records[idx - 1]
            const chosenPath = path.join(IMAGES_DIR, chosen.filename)
            console.log(`✅ 已选择参考图：${chosen.filename}\n`)

            try {
                const buf = await fs.readFile(chosenPath)
                referenceImageB64 = buf.toString('base64')
                referenceFilename = chosen.filename
            } catch (err) {
                console.log(`⚠️  读取参考图失败：${err?.message ?? err}`)
                return
            }

            const prevPrompt = chosen.prompt || ''
            console.log('\n📄  该图片上一次使用的提示词：\n' + (prevPrompt || '(无记录)') + '\n')

            const refineModeRaw = (
                await rl.question(
                    '👉 选择调优方式：1) 手动编辑之前的提示词  2) 让 AI 根据你的新 point 润色（直接回车默认为 1）：'
                )
            ).trim()
            const refineMode = refineModeRaw === '2' ? 2 : 1

            if (refineMode === 1) {
                if (!prevPrompt) {
                    console.log('⚠️  该图片没有记录过提示词，请输入一个新的 point。')
                    point = (await rl.question('👉  请输入新的 point（直接回车退出）：')).trim()
                    if (!point) return

                    console.log('\n🧠 正在润色提示词...')
                    const polished = await polishPrompt(point, qwenSystem)
                    console.log('✅ 润色结果：\n' + polished + '\n')
                    initialPromptForEdit = polished
                } else {
                    point = chosen.point || ''
                    initialPromptForEdit = prevPrompt
                }
            } else {
                const newPoint = (
                    await rl.question(
                        '👉 请输入新的 point（会结合原提示词一起交给 AI，例如：改成白天、更温暖等）（直接回车退出）：'
                    )
                ).trim()
                if (!newPoint) return
                point = newPoint

                const combinedPoint = `原图相关描述：${newPoint}\n原始提示词：${prevPrompt || '(无)'}`.trim()
                console.log('\n🧠 正在根据原提示词 + 新 point 润色...')
                const polished = await polishPrompt(combinedPoint, qwenSystem)
                console.log('✅ 润色结果：\n' + polished + '\n')
                initialPromptForEdit = polished
            }
        }

        const finalPrompt = await maybeEditPrompt(initialPromptForEdit, rl)
        if (finalPrompt !== initialPromptForEdit) {
            console.log('\n📝 已更新为你编辑后的提示词：\n' + finalPrompt + '\n')
        }

        await rl.question('↩️  回车确认并开始生成图片：')

        // Qwen 已完成一次会话，用完即停以释放资源
        await stopModel(REWRITE_MODEL)

        console.log('🖼️ 正在生成图片...')
        const b64 = await generateImageBase64(
            finalPrompt,
            imageSystem,
            referenceImageB64 ? [referenceImageB64] : []
        )
        const imgBuf = Buffer.from(b64, 'base64')
        const ext = detectImageExtOrNull(imgBuf) ?? 'png'

        const ts = new Date().toISOString().replaceAll(/[:.]/g, '-')
        const base = safeBasename(point || 'image')
        const filename = `${ts}_${base}.${ext}`
        const outPath = path.join(IMAGES_DIR, filename)
        await fs.writeFile(outPath, imgBuf)

        await addImageRecord({
            filename,
            point,
            prompt: finalPrompt,
            referenceFilename,
        })

        console.log(`🎉 已保存：${outPath}`)
        // 图像模型生成完毕，同样尝试 stop
        await stopModel(IMAGE_MODEL)
        // 生成完成后可在命令行中预览图片（仅在 iTerm2 + imgcat 下可用）
        const previewNewRaw = (
            await rl.question('🖼️ 是否在终端中预览新生成的图片？(y/N)：')
        )
            .trim()
            .toLowerCase()
        if (previewNewRaw === 'y') {
            await previewImageWithImgcat(outPath)
        }

        console.log('👋 生成完毕，脚本自动退出。')
    } finally {
        rl.close()
    }
}

function isITerm2() {
    return process.env.TERM_PROGRAM === 'iTerm.app' || Boolean(process.env.ITERM_SESSION_ID)
}

async function previewImageWithImgcat(filePath) {
    if (!isITerm2()) {
        console.log(
            `⚠️ 当前终端似乎不是 iTerm2，图片预览只在 iTerm2 中通过 imgcat 命令可用。\n   请在 iTerm2 中查看该图片或手动打开文件：${filePath}`
        )
        return
    }

    console.log(`\n🖼️ 使用 imgcat 预览图片：${filePath}\n`)

    await new Promise((resolve) => {
        const child = spawn('imgcat', [filePath], {
            stdio: ['ignore', 'inherit', 'inherit'],
        })

        child.on('error', (err) => {
            console.log(
                `⚠️ 调用 imgcat 失败，可能未安装或未在 PATH 中。\n   错误信息：${
                    err?.message ?? err
                }\n   请确认在 iTerm2 中安装并配置好 imgcat。`
            )
            resolve()
        })

        child.on('exit', () => {
            resolve()
        })
    })
}

async function previewExistingImage(records, rl) {
    console.log('\n🖼️ 已生成的图片记录：')
    records.forEach((r, idx) => {
        const shortPrompt = (r.prompt || '').slice(0, 40)
        console.log(
            `  [${idx + 1}] ${r.filename}  point: ${r.point || '-'}  prompt: ${
                shortPrompt || '-'
            }${shortPrompt.length === 40 ? '...' : ''}`
        )
    })

    const idxRaw = (await rl.question('👉 请输入要预览的编号（直接回车取消）：')).trim()
    if (!idxRaw) return
    const idx = Number.parseInt(idxRaw, 10)
    if (!Number.isFinite(idx) || idx < 1 || idx > records.length) {
        console.log('⚠️  编号不合法，已取消预览。')
        return
    }

    const chosen = records[idx - 1]
    const imgPath = path.join(IMAGES_DIR, chosen.filename)

    try {
        await fs.access(imgPath)
    } catch {
        console.log(`⚠️ 找不到图片文件：${imgPath}，可能已被移动或删除。`)
        return
    }

    await previewImageWithImgcat(imgPath)
}

