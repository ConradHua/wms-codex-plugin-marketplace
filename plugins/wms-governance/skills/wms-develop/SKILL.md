---
name: wms-develop
description: "实现、修改或解释 WMS / PDA API、Oracle 持久化、NServiceBus 消息、SAP NCo 调用和收货恢复时使用。"
---

# WMS 开发

读取业务仓库的适用 AGENTS.md，再读取 [WMS 通用规则](../../resources/AGENTS.md)。按需求同时读取 [SAP](../../resources/instructions/SAP_RFC.md)、[Oracle](../../resources/instructions/Oracle.md)、[REST](../../resources/instructions/Rest-API.md)。

真实代码和已确认契约优先于示例；出现冲突先指出。追踪真实调用链后实施最小业务切片，并运行实际工程的相关验证。不要使用示例虚构类/表，不默认连接生产服务。未初始化仓库也可以使用本技能；需要持久化规则及 hooks 时使用 wms-setup。
