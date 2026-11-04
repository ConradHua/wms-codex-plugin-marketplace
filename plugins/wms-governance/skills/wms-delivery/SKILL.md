---
name: wms-delivery
description: 在交付 WMS 修改、准备 Git 提交、提交或推送时使用；检查任务范围、暂存区密钥与验证证据。
---

# WMS 交付

1. 读取 AGENTS.md、用户授权和 git status。识别用户原有修改，明确本次提交文件与变更块。
2. 运行与修改相关的测试；业务项目从真实工程确定 build/test 命令。harness 项目运行 npm test。
3. 仅暂存明确属于任务的路径/变更块；有混合修改时使用经审查的补丁，不使用 git add -A。
4. 运行 `node <当前 SKILL.md 目录向上两层的 scripts/governance/scan-secrets.cjs 绝对路径> --staged`（执行目录为业务仓库）。非零即停止提交；不要输出命中原文。审查 git diff --cached 的范围与内容。
5. 仅在已有提交授权时执行 git commit，保留全部 Git 检查。无提交授权则交付文件和验证结果即可。
6. 推送仅在已有授权下执行；失败如实报告。禁止 --no-verify、强推、默认自动推送或用会话结束 hook 提交。
7. 汇报改动、已验证、未验证和真正待决定事项。

Stop hook 只提示工作区扫描结果。提交门禁依赖本流程、可选 Git hook 和 CI，不能用 Stop/SessionEnd 的退出码代替。
