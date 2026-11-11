/**
 * demographic-coder — Host half.
 *
 * The local Host owns revisioned research storage, exposes a compatible flat
 * mirror, writes explicit CSV/codebook/snapshot exports, and participates in
 * transactional study selection shared by local research plugins.
 *
 * Requests must be same-origin and carry the custom `x-demographic-coder`
 * header: a cross-origin page cannot send that header without a CORS
 * preflight this route never answers, so an unrelated web page cannot
 * overwrite the export.
 */

import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile, readFile, rename, copyFile, open, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { validateDataset, legacyDataset, mirrorDocument } from './dataset.js'
import { loadStudyContext, validateStudyDefinition } from './study-context.mjs'
import { hostBinding, bindingStatus } from '@local/research-core/host'
import { openResearchData } from '@local/research-core/data'
import { openFlow } from '@local/research-core/flow'

// Serialize requests from all instances in this process; the lock file also
// protects independently running hosts sharing the same research directory.
const writes = new Map()
async function serialize(target, run) {
  const previous = writes.get(target) || Promise.resolve()
  const next = previous.catch(() => {}).then(run)
  writes.set(target, next)
  try { return await next } finally { if (writes.get(target) === next) writes.delete(target) }
}

const ROUTE = '/api/demographic-coder'
const FOLDER = '人口学变量'
const MAX_BODY = 16 * 1024 * 1024
const DEFAULT_NAME = '人口学数据'

class RouteError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function send(res, status, payload) {
  const text = JSON.stringify(payload)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-content-type-options', 'nosniff')
  res.end(text)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new RouteError('too_large', '导出内容过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new RouteError('invalid', '请求体不是合法 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function sameOrigin(req) {
  const site = String(req.headers['sec-fetch-site'] || '')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = String(req.headers.origin || '')
  if (!origin) return true
  try {
    return new URL(origin).host === String(req.headers.host || '')
  } catch {
    return false
  }
}

function isInside(parent, child) {
  const rel = path.relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

function safeName(input) {
  const cleaned = String(input || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 60)
  return cleaned || DEFAULT_NAME
}

function statusFor(error) {
  if (error instanceof RouteError) {
    if (error.code === 'too_large') return 413
    if (error.code === 'invalid' || error.code === 'unsafe') return 400
    if (error.code === 'not_found') return 404
    if (error.code === 'conflict' || error.code === 'study_mismatch' || error.code === 'busy') return 409
  }
  return 500
}

export function apply(ctx, config = {}) {
  const configuredRoot = typeof config.root === 'string' && config.root.trim() ? path.resolve(config.root) : null
  const configuredLab = typeof config.labDir === 'string' && config.labDir.trim() ? path.resolve(config.labDir) : null

  function fallbackBase() {
    const workingDirectory = ctx.get ? ctx.get('workingDirectory') : undefined
    const candidate = workingDirectory && typeof workingDirectory.defaultDirectory === 'string'
      ? workingDirectory.defaultDirectory
      : ''
    return candidate || process.cwd()
  }

  let activeStudy = loadStudyContext(config, { cwd: fallbackBase(), pluginKey: 'demographics' })
  const VERSION = '1.2.0'
  let savingCount = 0
  const binding = hostBinding(ctx, {
    plugin: 'demographic-coder',
    version: VERSION,
    config,
    hooks: {
      emptyBase: () => fallbackBase(),
      loadStudy: studyPath => loadStudyContext({ studyPath }, { cwd: fallbackBase(), pluginKey: 'demographics' }),
      currentIdentity: () => ({ studyId: activeStudy.id, studyPath: activeStudy.path, dataRoot: activeStudy.dataRoot, revision: activeStudy.revision }),
      busy: () => savingCount > 0,
      prepareSwitch(studyPath) {
        if (savingCount) throw new RouteError('busy', '人口学数据正在保存，无法切换研究')
        const next = loadStudyContext({ studyPath }, { cwd: fallbackBase(), pluginKey: 'demographics' })
        const previous = activeStudy
        return { commit() { activeStudy = next }, rollback() { activeStudy = previous } }
      }
    }
  })
  binding.dispatch(ctx)

  function study() { return activeStudy }

  function labFile(context = study()) {
    return context.plugin.dataPath || path.join(context.plugin.labDir || context.dataRoot, 'demographics.json')
  }

  function defaultDir() {
    const context = study()
    if (context.configured) return context.plugin.exportDir || path.join(context.dataRoot, 'exports', 'demographics')
    return configuredRoot ? path.join(configuredRoot, FOLDER) : path.join(fallbackBase(), FOLDER)
  }

  function resolveDir(input) {
    const raw = typeof input === 'string' && input.trim() ? input.trim() : defaultDir()
    if (!path.isAbsolute(raw)) throw new RouteError('invalid', '保存位置需要是绝对路径')
    const resolved = path.resolve(raw)
    const context = study()
    const exportRoot = context.configured ? (context.plugin.exportDir || context.dataRoot) : configuredRoot
    if (exportRoot && !isInside(exportRoot, resolved)) {
      throw new RouteError('unsafe', '保存位置必须位于当前研究目录 ' + exportRoot)
    }
    return resolved
  }

  async function saveExport(payload) {
    const dir = resolveDir(payload && payload.dir)
    await mkdir(dir, { recursive: true })
    const base = safeName(payload && payload.name)
    const files = []
    const write = async (suffix, content, label) => {
      if (typeof content !== 'string' || !content.length) return
      const target = path.join(dir, base + suffix)
      // Excel only detects UTF-8 in a CSV when it starts with the BOM.
      const payload = suffix.endsWith('.csv') && !content.startsWith('\ufeff') ? '\ufeff' + content : content
      await writeFile(target, payload, 'utf8')
      files.push({ kind: label, name: base + suffix, path: target, bytes: Buffer.byteLength(payload, 'utf8') })
    }
    await write('.csv', payload.csv, 'data')
    await write('_编码手册.csv', payload.codebook, 'codebook')
    await write('.json', payload.json, 'snapshot')
    if (!files.length) throw new RouteError('invalid', '没有可写入的内容')
    return { dir, files }
  }

  async function reveal(payload) {
    const dir = resolveDir(payload && payload.dir)
    const info = await stat(dir).catch(() => null)
    if (!info || !info.isDirectory()) throw new RouteError('not_found', '文件夹不存在：' + dir)
    const file = payload && typeof payload.file === 'string' ? path.basename(payload.file) : ''
    const args = file ? ['/select,', path.join(dir, file)] : [dir]
    const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore' })
    child.unref()
    return { opened: file ? path.join(dir, file) : dir }
  }

  async function load(context = study()) {
    const target = labFile(context)
    let raw
    try { raw = await readFile(target, 'utf8') } catch (error) {
      if (error.code === 'ENOENT') return { study: context.identity, studyId: context.id, studyRevision: context.revision, revision: 'empty', dataset: null, path: target }
      throw error
    }
    const document = JSON.parse(raw.replace(/^\ufeff/, ''))
    const studyId = context.id
    if (document.schemaVersion !== undefined && document.schemaVersion !== 2) throw new RouteError('invalid', '不支持的人口学快照版本：' + document.schemaVersion)
    if (document.studyId && document.studyId !== studyId) throw new RouteError('study_mismatch', '磁盘快照属于其他研究，请显式导入恢复')
    const dataset = document.schemaVersion === 2 ? validateDataset(document.dataset) : legacyDataset(document)
    // Hash the bytes so external edits and legacy documents also invalidate stale tabs.
    const revision = createHash('sha256').update(raw).digest('hex')
    return { study: context.identity, studyId, studyRevision: context.revision, revision, dataset, path: target, legacy: document.schemaVersion !== 2 }
  }

  /**
   * 可选：把一次保存同步发布到研究核心（参与者索引 + demographics 代次）。
   * 默认关闭（publishFlow=false），避免在用户未授权时给既有研究新增目录结构；
   * 失败不丢已保存的兼容文件，只把原因带回给调用方。
   */
  function publishToFlow(document, view) {
    if (!view || !view.instanceId) return { skipped: true, reason: '没有绑定实例身份' }
    const data = openResearchData({ study: activeStudy, instanceId: view.instanceId })
    const flow = openFlow({ data, study: activeStudy, owner: 'demographic-coder' })
    const dataset = document.dataset || {
      columns: document.columns || [],
      rows: (document.rows || []).map(row => { const { id, ...values } = row; return { id, values } }),
    }
    const result = flow.demographics.commit({
      document: { schemaVersion: 2, ...dataset, name: document.name || dataset.name || '人口学数据' },
      createPending: true,
    })
    return result
  }

  async function sync(body, view) {
    const context = study()
    const target = labFile(context)
    savingCount++
    try { return await serialize(path.resolve(target), async () => {
      await mkdir(path.dirname(target), { recursive: true })
      const lockPath = target + '.lock'
      let lock
      try { lock = await open(lockPath, 'wx') } catch (error) {
        if (error.code === 'EEXIST') throw new RouteError('busy', '另一个进程正在保存；请稍后重试。若 Host 曾异常退出，请先检查遗留锁文件')
        throw error
      }
      const temporary = target + '.' + randomUUID() + '.tmp'
      try {
        const current = await load(context)
        if (body.studyRevision && body.studyRevision !== current.studyRevision) throw new RouteError('conflict', '研究配置已变化，请重新加载并核对草稿')
        if (body.studyId && body.studyId !== current.studyId) throw new RouteError('study_mismatch', '研究身份已变化，请重新加载；草稿仍保留')
        if (body.revision !== current.revision) throw new RouteError('conflict', '磁盘数据已被其他窗口修改；请导出草稿并重新加载后合并')
        let dataset
        try { dataset = validateDataset(body.dataset) } catch (error) { throw new RouteError('invalid', error.message) }
        for (const row of dataset.rows) if (!context.acceptsId(row.id)) throw new RouteError('invalid', '编号不符合研究配置：' + row.id)
        const document = mirrorDocument(dataset, { studyId: current.studyId, study: context.identity, updatedAt: new Date().toISOString() })
        const raw = JSON.stringify(document, null, 2)
        const handle = await open(temporary, 'wx')
        try { await handle.writeFile(raw, 'utf8'); await handle.sync() } finally { await handle.close() }
        if (current.revision !== 'empty') await copyFile(target, target + '.previous')
        await rename(temporary, target)
        const result = { study: context.identity, studyId: current.studyId, studyRevision: context.revision, revision: createHash('sha256').update(raw).digest('hex'), path: target, rows: dataset.rows.length, columns: dataset.columns.length }
        if (config.publishFlow === true) {
          try { result.flow = publishToFlow(document, view) }
          catch (error) { result.flowError = String(error && error.message ? error.message : error); console.error('[demographic-coder] 发布到研究核心失败：', error) }
        }
        return result
      } finally {
        await unlink(temporary).catch(() => {})
        await lock.close()
        await unlink(lockPath)
      }
    }) } finally { savingCount-- }
  }

  async function createStudy(actor, payload = {}) {
    const target = payload.studyPath
    if (typeof target !== 'string' || !path.isAbsolute(target)) throw new RouteError('invalid', '新研究配置需要绝对 JSON 路径')
    const problems = validateStudyDefinition(payload.definition)
    if (problems.length) throw new RouteError('invalid', problems.join('；'))
    await mkdir(path.dirname(target), { recursive: true })
    try { await writeFile(target, JSON.stringify(payload.definition, null, 2), { encoding: 'utf8', flag: 'wx' }) }
    catch (error) { if (error.code === 'EEXIST') throw new RouteError('conflict', '配置已存在，请选择加载或使用新路径'); throw error }
    try {
      const view = binding.connect(actor, { studyPath: target })
      const active = await binding.activate(actor)
      return { binding: active || view, study: activeStudy.identity }
    } catch (error) {
      await unlink(target).catch(() => {})
      throw error
    }
  }

  async function studyConnect(actor, payload = {}) {
    if (typeof payload.studyPath !== 'string' || !path.isAbsolute(payload.studyPath)) throw new RouteError('invalid', '请选择研究 JSON 的绝对路径')
    const view = binding.connect(actor, { studyPath: payload.studyPath })
    const active = await binding.activate(actor)
    return { binding: active || view, study: activeStudy.identity }
  }

  /** UI、HTTP 与工具共用的唯一入口：先解析/校验绑定，再执行。 */
  async function action(actor, name, payload = {}) {
    if (name === 'capabilities') {
      await binding.read(actor, () => null)
      return { ...binding.capabilities(actor), study: activeStudy.identity }
    }
    if (name === 'studyConnect') return await studyConnect(actor, payload)
    if (name === 'createStudy') return await createStudy(actor, payload)
    if (name === 'status') {
      const { binding: view, data } = await binding.read(actor, () => (async () => ({ defaultDir: defaultDir(), root: configuredRoot, platform: process.platform, study: activeStudy.identity, studyId: activeStudy.id }))())
      return { ...data, binding: view, study: activeStudy.identity }
    }
    if (name === 'load') {
      const { binding: view, data } = await binding.read(actor, () => load(activeStudy))
      return { ...data, binding: view, study: activeStudy.identity }
    }
    if (name === 'reveal') {
      const { binding: view, data } = await binding.read(actor, () => reveal(payload || {}))
      return { ...data, binding: view }
    }
    if (!['save', 'sync'].includes(name)) throw new RouteError('unknown_action', '未知操作：' + name)
    const expected = { token: payload.binding || payload.bindingToken, studyId: payload.studyId, studyRevision: payload.studyRevision }
    const { binding: view, data } = await binding.write(actor, expected, resolvedView => (name === 'sync' ? sync(payload || {}, resolvedView) : (async () => { savingCount++; try { return await saveExport(payload) } finally { savingCount-- } })()))
    return { ...data, binding: view, study: activeStudy.identity }
  }

  const handler = async (req, res) => {
    if (!sameOrigin(req) || req.headers['x-demographic-coder'] !== '1') {
      send(res, 403, { ok: false, error: { code: 'forbidden', message: '拒绝跨站访问人口学录入接口' } })
      return
    }
    try {
      const url = new URL(req.url || ROUTE, 'http://localhost')
      if (req.method === 'GET') {
        const name = url.searchParams.get('action') || 'status'
        if (!['status', 'load', 'capabilities'].includes(name)) {
          send(res, 404, { ok: false, error: { code: 'unknown_action', message: '未知操作：' + name } })
          return
        }
        const actor = binding.pageActor({ req, pageId: url.searchParams.get('pageId'), workspaceId: url.searchParams.get('workspaceId'), sessionId: url.searchParams.get('sessionId') })
        send(res, 200, { ok: true, data: await action(actor, name, Object.fromEntries(url.searchParams)) })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: { code: 'method', message: '只接受 GET 与 POST' } })
        return
      }
      const body = await readBody(req)
      const name = String(body.action || url.searchParams.get('action') || '')
      if (!['status', 'load', 'save', 'sync', 'reveal', 'studyConnect', 'createStudy', 'capabilities'].includes(name)) {
        send(res, 404, { ok: false, error: { code: 'unknown_action', message: '未知操作：' + name } })
        return
      }
      const payload = body.payload || body
      const actor = binding.pageActor({ req, pageId: payload.pageId, workspaceId: payload.workspaceId, sessionId: payload.sessionId })
      send(res, 200, { ok: true, data: await action(actor, name, payload) })
    } catch (error) {
      const status = bindingStatus(error) || statusFor(error)
      if (status >= 500) console.error('[demographic-coder]', error)
      send(res, status, {
        ok: false,
        error: { code: error && error.code ? error.code : 'error', message: String(error && error.message ? error.message : error), details: error && error.details }
      })
    }
  }

  const webServer = ctx.get ? ctx.get('webServer') : undefined
  if (webServer) {
    ctx.effect(() => webServer.register({ kind: 'prefix', path: ROUTE, handler }), 'demographic-coder: http route')
  } else {
    ctx.inject(['webServer'], scope => {
      scope.effect(
        () => scope.webServer.register({ kind: 'prefix', path: ROUTE, handler }),
        'demographic-coder: http route'
      )
    })
  }
}

export const name = 'demographic-coder'
