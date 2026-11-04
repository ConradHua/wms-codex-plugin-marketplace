# WMS / .NET 安全检查

- 沿用 ASP.NET Core 的现有认证、授权策略与 ProblemDetails；字段校验错误按 WMS 契约返回 400。认证检查不代替工厂、仓库、operationId 的对象授权。
- Oracle SQL 显式设置 BindByName 和参数类型。Schema/表名只来自批准的固定映射，不能绑定时也不能接受任意请求字符串。
- NCo、RabbitMQ、Oracle 的密码来自既有机密存储。只核对配置键，不在对话或日志打印配置值；禁止关闭证书验证。
- 异常日志保存 correlationId、阶段、错误码，避免记录 Authorization、请求全文和完整 SAP 返回。
- 读取实际 SDK 版本后，使用它支持的 `dotnet list <project> package --vulnerable --include-transitive` 或相应新版命令；记录不可达源、未支持的检查和延后修复依据。无业务工程时不伪造审计结果。
- SAP 测试双只证明映射与分支。真实 LUW、锁、Commit、Oracle 唯一约束和权限须在授权的测试环境另验。
