import fs from 'node:fs/promises'
import path from 'node:path'
import { IMAGES_DIR, METADATA_PATH } from './config.js'

async function loadAllRaw() {
    try {
        const txt = await fs.readFile(METADATA_PATH, 'utf8')
        const data = JSON.parse(txt)
        if (Array.isArray(data)) return data
        if (Array.isArray(data.items)) return data.items
        return []
    } catch {
        return []
    }
}

async function saveAllRaw(items) {
    const data = JSON.stringify(items, null, 2)
    await fs.mkdir(IMAGES_DIR, { recursive: true })
    await fs.writeFile(METADATA_PATH, data, 'utf8')
}

function makeId() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export async function listImageRecords() {
    const items = await loadAllRaw()
    return items
}

export async function addImageRecord({ filename, point, prompt, referenceFilename }) {
    const items = await loadAllRaw()
    const now = new Date().toISOString()
    const record = {
        id: makeId(),
        filename,
        point: point ?? '',
        prompt: prompt ?? '',
        referenceFilename: referenceFilename ?? null,
        createdAt: now,
    }
    items.push(record)
    await saveAllRaw(items)
    return record
}

export async function deleteImageRecordById(id) {
    const items = await loadAllRaw()
    const idx = items.findIndex((r) => r.id === id)
    if (idx === -1) return null
    const [record] = items.splice(idx, 1)
    await saveAllRaw(items)

    if (record?.filename) {
        try {
            const imgPath = path.join(IMAGES_DIR, record.filename)
            await fs.unlink(imgPath)
            console.log(`🗑️ 已删除图片文件：${imgPath}`)
        } catch (err) {
            console.warn(`⚠️ 删除图片文件失败：${record.filename}`, err?.message ?? err)
        }
    }

    return record
}

