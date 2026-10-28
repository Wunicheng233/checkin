import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const BASE_URL = 'https://glados.cloud'

export const request = async (path, cookie, options = {}, fetchImpl = fetch) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let response
    try {
      response = await fetchImpl(`${BASE_URL}${path}`, {
        ...options,
        headers: {
          cookie,
          referer: `${BASE_URL}/console/checkin`,
          'user-agent': 'Mozilla/5.0',
          ...options.headers,
        },
        signal: AbortSignal.timeout(30000),
      })
    } catch {
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
        continue
      }
      throw new Error(`${path}: 网络连接失败或请求超时`)
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await response.body?.cancel()
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
      continue
    }
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    let data
    try {
      data = await response.json()
    } catch {
      throw new Error(`${path}: 服务返回非 JSON 内容，可能是登录页或访问验证`)
    }
    if (path === '/api/user/checkin' && data?.code === 1 && data?.message === 'Please Try Tomorrow') {
      return { ...data, alreadyCheckedIn: true }
    }
    if (data?.code !== 0) {
      // Do not log API payloads: they may contain account information.
      const code = typeof data?.code === 'number' ? data.code : 'missing'
      if (data?.reason === 'device-mismatch') {
        throw new Error(`${path}: 登录设备不匹配，请重新登录并更新 Cookie`)
      }
      const message = String(data?.message ?? '')
      const auth = code === -2 || /cookie|login|log in|登录|登陆|认证|身份|expired|未授权|没有权限/i.test(message)
      throw new Error(`${path}: API code=${code}${auth ? '，登录凭证失效，请更新 GLADOS Secret 中的 Cookie' : '，签到未被服务确认'}`)
    }
    return data
  }
}

export const glados = async (env = process.env, fetchImpl = fetch) => {
  const cookies = String(env.GLADOS ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
  if (!cookies.length) return { notice: ['Checkin Error: 缺少 GLADOS Secret'], failed: true }
  const notice = []
  let failed = false
  for (const [index, cookie] of cookies.entries()) {
    const account = `帐号 ${index + 1}`
    try {
      const action = await request('/api/user/checkin', cookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: 'glados.cloud' }),
      }, fetchImpl)
      notice.push(`${account}: ${action.alreadyCheckedIn ? '今日已签到' : 'Checkin OK'}`)
      try {
        const status = await request('/api/user/status', cookie, { method: 'GET' }, fetchImpl)
        const leftDays = Number(status?.data?.leftDays)
        if (Number.isFinite(leftDays)) notice.push(`Left Days ${leftDays.toFixed(1)}`)
      } catch (error) {
        notice.push(`${account}: 签到已确认，查询剩余天数失败：${error.message}`)
      }
    } catch (error) {
      failed = true
      notice.push(`${account}: Checkin Error: ${error.message}`)
    }
  }
  return { notice, failed }
}

const notify = async (notice) => {
  if (!process.env.NOTIFY || !notice) return
  for (const option of String(process.env.NOTIFY).split('\n')) {
    if (!option) continue
    try {
      if (option.startsWith('console:')) {
        for (const line of notice) {
          console.log(line)
        }
      } else if (option.startsWith('wxpusher:')) {
        await fetch(`https://wxpusher.zjiecode.com/api/send/message`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            appToken: option.split(':')[1],
            summary: notice[0],
            content: notice.join('<br>'),
            contentType: 3,
            uids: option.split(':').slice(2),
          }),
        })
      } else if (option.startsWith('pushplus:')) {
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option.split(':')[1],
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      } else if (option.startsWith('bark:')) {
        await fetch(`https://api.day.app/${option.split(':')[1]}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: notice[0],
            body: notice.slice(1).join('\n'),
          }),
        })
      } else if (option.startsWith('qyweixin:')) {
        const qyweixinToken = option.split(':')[1]
        const qyweixinNotifyRebotUrl = 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=' + qyweixinToken;
        await fetch(qyweixinNotifyRebotUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'markdown',
            markdown: {
                content: notice.join('<br>')
            }
          }),
        })
      } else {
        // fallback
        await fetch(`https://www.pushplus.plus/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            token: option,
            title: notice[0],
            content: notice.join('<br>'),
            template: 'markdown',
          }),
        })
      }
    } catch (error) {
      throw error
    }
  }
}

export const main = async () => {
  const { notice, failed } = await glados()
  // Always report the result, even without an optional notification service.
  for (const line of notice) console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, notice.join('\n\n') + '\n')
  }
  if (failed) process.exitCode = 1
  await notify(notice)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('任务执行失败，请检查签到结果及通知配置。')
    process.exitCode = 1
  })
}
