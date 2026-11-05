---
name: wms-setup
description: "安装插件后，为当前业务 Git 仓库初始化 WMS 领域指引、审查角色和按仓库启用的审计；不用于普通功能开发。"
---

# 初始化 WMS 仓库

读取现有 AGENTS.md、git status 和用户指定目标。说明将增加规则和脚本，已有初始化授权则继续。

1. 以当前 SKILL.md 的目录为基准，解析 ../../scripts/setup-repo.cjs 的绝对路径。不要假设插件位于业务仓库。
2. 先执行 node <脚本绝对路径> --target <真实 Git 根目录> --dry-run，列出待部署文件。
3. 若用户已请求初始化，执行同一命令去掉 --dry-run。有冲突则停止并给出需合并文件，不覆盖现有指引。
4. 脚本安装 AGENTS.md、专项规则、设置、两个 TOML 角色、扫描脚本及激活标记。它不安装第二份技能或仓库 hooks，不提交、不推送。当前 Codex hooks 扫描用户提示词、记录脱敏预览并在 Stop 扫描变更；不提供 transformed-prompt 改写或 pre-tool-use 工具门禁。
5. 提醒用户审核并信任插件 hooks，重新开启业务仓库聊天验收。已有旧版 WMS 仓库 hooks 时先解决重复配置，不能同时运行。

卸载插件不会删除业务仓库中的指引。暂时停用运行事件可将 governance/plugin-activation.json 的 enabled 设置为 false。
