# WMS Governance 0.2.2

本地 Codex desktop 插件，含六个技能和按仓库激活的治理 hooks。运行需要 Node.js 22+ 和 Git，无额外 npm 依赖。安装后选择插件，在业务仓库发送“使用 wms-setup 为当前仓库初始化治理”，再审核信任 hooks。未激活仓库仅可使用技能，不运行治理扫描或审计。

技能：wms-setup、wms-develop、wms-security-and-hardening、wms-code-review、wms-security-review、wms-delivery。审查以技能形式可直接使用；初始化后也提供两个项目级 TOML 角色。

本地日志位于业务仓库 logs/codex/governance，包含脱敏提示词预览（最多 2,000 字符）、事件元数据和哈希会话标识。支持凭据、私钥、电子邮件及中国大陆手机号的模式脱敏，但不能保证覆盖所有敏感信息。威胁检测为启发式规则；standard 默认阻止命中风险的提示词提交，Stop hook 扫描变更并提示发现。当前 Codex hook 接口不提供 transformed-prompt 或 pre-tool-use 事件，因此不支持工具调用门禁或逐请求确认恢复流程。插件不连接生产服务、不向外发送审计数据、不自动提交推送。

全局安装不等于业务仓库初始化。已有 AGENTS.md 的仓库需手动合并。本包含 hooks，使用本地 marketplace 安装，不作为公共插件目录上传包。
