# WMS Governance Plugin Marketplace

这是一个供团队本地安装的 Codex 插件 marketplace，当前包含 **WMS Governance 0.2.2**。插件为 WMS–SAP 集成开发提供领域规则、开发与审查技能，以及由业务仓库显式启用的本地治理 hooks。

本项目是插件分发与实现仓库，不包含 WMS 业务系统源码，也不会连接 Oracle、RabbitMQ 或 SAP。全局安装插件不会自动修改业务仓库；要部署仓库级规则和启用 hooks，必须显式运行初始化流程。

## 能力概览

| 模块 | 位置 | 用途 |
| --- | --- | --- |
| Marketplace 清单 | [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json) | 将本地 `plugins/wms-governance` 注册为可安装插件。 |
| 插件清单 | [`plugin.json`](./plugins/wms-governance/.codex-plugin/plugin.json) | 定义插件版本、技能、hooks 和入门技能。 |
| Skills | [`skills/`](./plugins/wms-governance/skills/) | 按需执行仓库初始化、WMS 开发、安全加固、代码审查、安全审查和交付检查。 |
| 领域规则 | [`resources/`](./plugins/wms-governance/resources/) | 提供 WMS–SAP 通用规则，以及 Oracle、REST API、SAP RFC 专项指引。 |
| 仓库初始化模板 | [`repository/`](./plugins/wms-governance/repository/) | 部署到业务仓库的 `AGENTS.md`、专项规则、配置和启用标记。 |
| Hooks 与审计 | [`hooks/`](./plugins/wms-governance/hooks/) | 在已初始化且启用的业务仓库中处理提示词检查和变更扫描。 |
| 治理脚本 | [`scripts/`](./plugins/wms-governance/scripts/) | 初始化业务仓库、检测威胁与脱敏审计数据。 |

## 插件包含内容

### Skills

插件提供六个可按需使用的技能：

- **`wms-setup`**：检查目标 Git 仓库并部署治理文件；支持 dry-run，遇到文件冲突时停止，不覆盖现有内容。
- **`wms-develop`**：遵循仓库实际架构和 WMS 领域规则，实施 WMS / PDA API、Oracle、NServiceBus、RabbitMQ 与 SAP NCo 相关修改。
- **`wms-security-and-hardening`**：为安全敏感功能提供威胁建模、安全边界和加固检查流程。
- **`wms-code-review`**：从正确性、可读性、架构、安全和性能维度审查代码变更。
- **`wms-security-review`**：聚焦输入处理、鉴权、数据保护、基础设施和第三方集成的安全审查。
- **`wms-delivery`**：核对变更范围、运行相关验证、扫描暂存区，并遵循明确的提交或推送授权。

代码审查和安全审查首先以技能形式提供。初始化业务仓库后，还会部署两个项目级 TOML 角色供显式委派；未初始化时不要假定这些角色已存在。

### 领域指导

领域规则面向典型的 WMS–SAP 集成技术栈，包括 .NET / ASP.NET Core、NServiceBus、RabbitMQ、Oracle 和 SAP NCo。规则重点包括：

- 修改前从真实项目和调用链确认架构、接口、表结构与测试，不把文档示例误认为仓库中已存在的实现。
- 保持 HTTP、业务服务、消息处理、SAP Adapter 和 Oracle 访问的职责边界。
- 对收货事件使用稳定标识和持久化状态处理重试；将 SAP 结果未知（`UNKNOWN`）作为待核实状态，避免重复过账。
- 保持标识符字符串和数量精度；使用参数化 SQL，不在源码或日志中暴露凭据。
- 根据任务读取相应的 [Oracle 规则](./plugins/wms-governance/resources/instructions/Oracle.md)、[REST API 规则](./plugins/wms-governance/resources/instructions/Rest-API.md) 或 [SAP RFC 规则](./plugins/wms-governance/resources/instructions/SAP_RFC.md)。

这些是开发指导，不替代实际系统契约、代码测试、CI、数据库权限或 SAP 授权。

## 安装与初始化

### 环境要求

- 支持插件和 hooks 的 Codex desktop / Codex CLI 环境。
- Node.js 22 或更高版本，以及 Git。
- 插件脚本无额外 npm 依赖。

### 安装

在 Codex 插件设置中添加本地 marketplace，路径指向本仓库，然后从 `wms-local` marketplace 安装 `wms-governance`。marketplace 配置见 [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)。此仓库使用本地插件来源，当前不作为公共插件目录发布。

安装后，在目标业务仓库中调用 `wms-setup`，或发送“使用 wms-setup 为当前仓库初始化治理”。初始化会先预览待部署文件，再按技能流程写入；如发现目标文件已存在，应人工合并而不是覆盖。

初始化完成后，审核并信任插件 hooks，再在该业务仓库中重新开启会话进行验收。全局安装与仓库初始化是两个独立步骤：**没有初始化标记或标记被禁用的仓库不会运行治理扫描或审计 hooks，但仍可手动使用插件技能。**

## Hooks、日志与安全边界

在已初始化且激活的仓库中，hooks 可在支持的 Codex 事件上运行提示词风险检查、审计记录和 Stop 阶段的变更扫描。`governance/settings.json` 中 `blockThreats` 默认启用；`standard` 级别下，命中风险规则的提示词提交会被阻止。风险检测基于启发式规则，可能漏报或误报。

审计日志写入业务仓库的 `logs/codex/governance`，记录事件元数据、哈希会话标识和最多 2,000 字符的脱敏提示词预览。实现包含凭据、私钥、电子邮件和中国大陆手机号等模式的脱敏，但不能保证识别所有机密、个人信息或提示词注入；日志仍应按敏感数据管理并限制访问与保留期限。

当前 Codex hooks 接口不提供 transformed-prompt 或 pre-tool-use 事件。因此插件**不会透明改写原始提示词，也不能提供工具调用门禁或逐请求确认恢复流程**；Stop hook 仅扫描并提示，不是提交门禁。实际工具权限由 Codex 运行环境控制。

插件不连接生产服务、不向外发送审计数据、不自动提交或推送代码。Hook 检查属于辅助措施，不能替代代码审查、CI、Git 提交检查、数据库权限或 SAP 授权。

## 本地开发与验证

修改 hooks 或插件清单后，可运行仓库提供的集成检查：

```sh
node scripts/check-plugin-hooks.cjs
```

该检查通过临时 `CODEX_HOME` 安装本地插件，并验证 Codex 能发现四类 hook 事件和六个技能；需要本机安装可用的 `codex` 命令。脚本结束时会清理其创建的临时目录。

## 仓库结构

```text
wms-plugin-marketplace/
├── .agents/plugins/marketplace.json       # 本地 marketplace 注册表
├── plugins/wms-governance/
│   ├── .codex-plugin/plugin.json           # 插件元数据与技能入口
│   ├── hooks/                              # Codex hook 配置与分发器
│   ├── repository/                         # 部署至业务仓库的治理文件
│   ├── resources/                          # WMS 通用规则与领域专项指引
│   ├── scripts/                            # 初始化与治理脚本
│   └── skills/                             # 六个可调用技能
└── scripts/check-plugin-hooks.cjs          # 插件安装与 hooks 集成检查
```

## 注意事项

- 初始化前检查目标 Git 仓库及现有 `AGENTS.md`；已有文件需要人工合并。
- 卸载插件不会删除已部署到业务仓库的治理文件。临时停用仓库 hooks，可将 `governance/plugin-activation.json` 中的 `enabled` 设为 `false`。
- 若仓库已配置旧版独立 WMS hooks，应先处理重复配置，避免同时运行两套治理逻辑。
- 初始化、提交、推送及业务系统写入是不同操作；插件不会因安装或会话结束而自动执行提交或推送。
