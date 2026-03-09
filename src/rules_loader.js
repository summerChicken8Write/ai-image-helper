// 负责从 rules.md 文本中抽取各个 section，并组合出最终的 system。

export function extractMarkdownSection(md, headingText) {
    const lines = String(md ?? '').split('\n')
    const target = `## ${headingText}`.trim()
    let start = -1
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === target) {
            start = i + 1
            break
        }
    }
    if (start === -1) return ''
    const out = []
    for (let i = start; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim().startsWith('## ')) break
        out.push(line)
    }
    return out.join('\n').trim()
}

export function buildSystemsFromRules(rulesMd) {
    const globalRules = extractMarkdownSection(rulesMd, 'GLOBAL_RULES')
    const qwenSystemRaw = extractMarkdownSection(rulesMd, 'QWEN_CHAT_SYSTEM')
    const imageSystemRaw = extractMarkdownSection(rulesMd, 'Z_IMAGE_GENERATE_SYSTEM')

    if (!qwenSystemRaw) throw new Error('rules.md 缺少或为空：## QWEN_CHAT_SYSTEM')
    if (!imageSystemRaw) throw new Error('rules.md 缺少或为空：## Z_IMAGE_GENERATE_SYSTEM')

    const qwenSystem = [globalRules, qwenSystemRaw].filter(Boolean).join('\n\n').trim()
    const imageSystem = [globalRules, imageSystemRaw].filter(Boolean).join('\n\n').trim()

    return {
        globalRules,
        qwenSystemRaw,
        imageSystemRaw,
        qwenSystem,
        imageSystem,
    }
}

