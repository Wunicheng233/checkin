import test from 'node:test'
import assert from 'node:assert/strict'
import { glados, request } from './main.js'

const json = (data) => new Response(JSON.stringify(data), {
  headers: { 'content-type': 'application/json' },
})

test('missing or whitespace credentials fail without network calls', async () => {
  for (const GLADOS of [undefined, ' \r\n ']) {
    const result = await glados({ GLADOS }, () => assert.fail('unexpected network call'))
    assert.equal(result.failed, true)
  }
})

test('successful check-in sends the configured cookie and token', async () => {
  const calls = []
  const result = await glados({ GLADOS: ' session=example; \r\n' }, async (url, options) => {
    calls.push({ url, options })
    return json(url.endsWith('/checkin') ? { code: 0 } : { code: 0, data: { leftDays: '12.75' } })
  })
  assert.equal(result.failed, false)
  assert.match(result.notice[0], /Checkin OK/)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.headers.cookie, 'session=example;')
  assert.deepEqual(JSON.parse(calls[0].options.body), { token: 'glados.cloud' })
})

test('expired credentials fail, omit sensitive payloads and continue other accounts', async () => {
  const result = await glados({ GLADOS: 'bad\ngood' }, async (url, options) => {
    if (options.headers.cookie === 'bad') return json({ code: -2, message: 'private-account@example.com' })
    return json({ code: 0, data: { leftDays: 10 } })
  })
  assert.equal(result.failed, true)
  assert.match(result.notice[0], /登录凭证失效/)
  assert.match(result.notice.join('\n'), /帐号 2: Checkin OK/)
  assert.doesNotMatch(result.notice.join('\n'), /private-account/)
})

test('an empty or malformed API response cannot count as success', async () => {
  for (const data of [{}, null, { code: '0' }]) {
    await assert.rejects(request('/api/user/checkin', 'example', {}, async () => json(data)), /API code=/)
  }
})

test('HTTP and HTML errors are actionable without exposing the response', async () => {
  await assert.rejects(request('/api/user/checkin', 'example', {}, async () => new Response('secret', { status: 403 })), /HTTP 403/)
  await assert.rejects(request('/api/user/checkin', 'example', {}, async () => new Response('<html>secret</html>')), /非 JSON/)
})

test('a failed status query does not undo a confirmed check-in', async () => {
  const result = await glados({ GLADOS: 'example' }, async (url) => json(url.endsWith('/checkin') ? { code: 0 } : { code: -2 }))
  assert.equal(result.failed, false)
  assert.match(result.notice.join('\n'), /查询剩余天数失败/)
})

test('only the explicit already-checked-in response is accepted', async () => {
  const result = await glados({ GLADOS: 'example' }, async (url) => json(url.endsWith('/checkin') ? { code: 1, message: 'Please Try Tomorrow' } : { code: 0 }))
  assert.equal(result.failed, false)
  assert.match(result.notice[0], /今日已签到/)
  await assert.rejects(request('/api/user/checkin', 'example', {}, async () => json({ code: 1, message: 'other failure' })), /API code=1/)
})

test('device mismatch gives a specific recovery instruction', async () => {
  await assert.rejects(request('/api/user/checkin', 'example', {}, async () => json({ code: 4, reason: 'device-mismatch' })), /登录设备不匹配/)
})
