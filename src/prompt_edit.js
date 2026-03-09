import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

/**
 * 让你在把提示词交给图像模型前做手动编辑。
 * - 若设置了 EDITOR，则用外部编辑器；否则在终端行内编辑。
 */
export async function maybeEditPrompt(prompt, rl) {
    console.log('✍️  你可以在交给图像模型前编辑提示词。')

    const editor = process.env.EDITOR
    if (editor) {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'imageHelper-'))
        const filePath = path.join(dir, 'prompt.txt')
        await fs.writeFile(filePath, prompt + '\n', 'utf8')

        const r = spawnSync(editor, [filePath], { stdio: 'inherit', shell: true })
        if (r.error) throw r.error
        if (typeof r.status === 'number' && r.status !== 0) {
            throw new Error(`编辑器退出码异常：${r.status}（EDITOR=${editor}）`)
        }

        const edited = (await fs.readFile(filePath, 'utf8')).trim()
        if (!edited) {
            console.log('⚠️  编辑后的提示词为空，将继续使用原提示词。')
            return prompt
        }
        return edited
    }

    console.log('\n✍️  当前提示词已填入输入行，直接回车表示不修改：')
    rl.write(prompt)
    const inline = (await rl.question('')).trim()
    return inline || prompt
}

