# Checkin

GitHub Actions 实现 [GLaDOS][glados] 自动签到

([GLaDOS][glados] 可用邀请码: `MW4DK-O0RSF-C7AOU-EN1MP`, 双方都有奖励天数)

## 使用说明

1. Fork 这个仓库

1. 登录 [GLaDOS][glados] 获取 Cookie

1. 添加 Cookie 到 Secret `GLADOS`

1. 启用 Actions, 计划每天北京时间 00:10 自动签到（GitHub 调度可能延迟）

## 高级功能

1. 如有多个帐号, 可以写为多行 Secret `GLADOS`, 每行写一个 Cookie

1. 如需修改时间, 可以修改文件 [run.yml](.github/workflows/run.yml#L7) 中的 `cron` 参数, 格式可参考 [crontab]

1. 如需推送通知, 可配置 Secret `NOTIFY`, 已支持:
    1. [WxPusher][wxpusher]: 格式 `wxpusher:{token}:{uid}`
    1. [PushPlus][pushplus]: 格式 `pushplus:{token}`
    1. [Bark][bark]: 格式 `bark:{key}`
    1. [企业微信][qyweixin]: 格式 `qyweixin:{key}`
    1. Console: 格式 `console:log`（现在即使不配置通知，也会输出签到结果）
    1. 如需配置多个, 可以写为多行, 每行写一个

1. 注意: Cookie 以及接口输出数据, 包含帐号敏感信息, 因此不要随意公开

---

[glados]: https://github.com/glados-network/GLaDOS
[crontab]: https://crontab.guru/
[pushplus]: https://www.pushplus.plus/
[wxpusher]: https://wxpusher.zjiecode.com/
[bark]: https://github.com/Finb/Bark
[qyweixin]: https://developer.work.weixin.qq.com/document/path/91770

## 签到失败排查

Actions 的 `npm run main` 步骤和运行摘要会显示每个帐号的签到结果。签到失败会将任务标记为失败，不再只显示绿色而隐藏错误。日志不会输出 Cookie、邮箱或完整接口响应。

- `API code=-2` / 登录凭证失效：重新登录 GLaDOS，在浏览器开发者工具的 Network 中找到 `/api/user/checkin` 或 `/api/user/status` 请求，复制 Request Headers 中完整的 `Cookie` 值，然后到仓库 Settings → Secrets and variables → Actions 更新 `GLADOS`。只复制值，不要带 `Cookie:` 前缀。请勿将 Cookie 写入代码、Issue 或公开日志。
- 更新后，在 Actions → run → Run workflow 选择 `main` 手动验证。看到 `Checkin OK` 或明确的“今日已签到”才表示成功。
- 登录设备不匹配：重新登录并更新 Cookie；如果仍然失败，需检查网站要求的登录设备信息。
- HTTP 403 / 非 JSON：可能遇到站点访问验证；网络错误、HTTP 429 和 5xx 会自动重试，最多三次，每次请求最多等待 30 秒。

Cookie 有有效期，脚本无法在没有重新登录的情况下自动生成新 Cookie。签到结果以签到接口为准，查询剩余天数失败会单独显示提示。

本地回归检查：`npm test`（使用模拟响应，不需要真实 Cookie）。
