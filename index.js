// 入口文件：仅负责调用 src 下的主流程。
import { main } from './src/llm_workflow.js'

main().catch(console.error)