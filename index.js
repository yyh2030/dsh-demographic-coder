/**
 * demographic-coder — Host half.
 *
 * The panel and the agent share one on-disk result: this route writes the
 * exported CSV, its codebook and a JSON snapshot into the folder the user
 * chose, and can reveal that folder in Explorer.
 *
 * Requests must be same-origin and carry the custom `x-demographic-coder`
 * header: a cross-origin page cannot send that header without a CORS
 * preflight this route never answers, so an unrelated web page cannot
 * overwrite the export.
 */

import { spawn } from 'node:child_process'
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

  function labFile() {
    const dir = configuredLab || path.join(fallbackBase(), '_lab')
    return path.join(dir, 'demographics.json')
  }

  function defaultDir() {
    return configuredRoot ? path.join(configuredRoot, FOLDER) : path.join(fallbackBase(), FOLDER)
  }

  function resolveDir(input) {
    const raw = typeof input === 'string' && input.trim() ? input.trim() : defaultDir()
    if (!path.isAbsolute(raw)) throw new RouteError('invalid', '保存位置需要是绝对路径')
    const resolved = path.resolve(raw)
    if (configuredRoot && !isInside(configuredRoot, resolved)) {
      throw new RouteError('unsafe', '保存位置必须位于 ' + configuredRoot)
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

  const actions = {
    async status() {
      return { defaultDir: defaultDir(), root: configuredRoot, platform: process.platform }
    },
    async save(payload) {
      return saveExport(payload || {})
    },
    async sync(payload) {
      const body = payload || {}
      const target = labFile()
      await mkdir(path.dirname(target), { recursive: true })
      const snapshot = {
        name: String(body.name || '人口学数据'),
        updatedAt: new Date().toISOString(),
        columns: Array.isArray(body.columns) ? body.columns : [],
        rows: Array.isArray(body.rows) ? body.rows : []
      }
      await writeFile(target, JSON.stringify(snapshot, null, 2), 'utf8')
      return { path: target, rows: snapshot.rows.length, columns: snapshot.columns.length }
    },
    async reveal(payload) {
      return reveal(payload || {})
    }
  }

  const handler = async (req, res) => {
    if (!sameOrigin(req) || req.headers['x-demographic-coder'] !== '1') {
      send(res, 403, { ok: false, error: { code: 'forbidden', message: '拒绝跨站访问人口学录入接口' } })
      return
    }
    try {
      const url = new URL(req.url || ROUTE, 'http://localhost')
      if (req.method === 'GET') {
        const action = url.searchParams.get('action') || 'status'
        const run = actions[action]
        if (!run) {
          send(res, 404, { ok: false, error: { code: 'unknown_action', message: '未知操作：' + action } })
          return
        }
        send(res, 200, { ok: true, data: await run({}) })
        return
      }
      if (req.method !== 'POST') {
        send(res, 405, { ok: false, error: { code: 'method', message: '只接受 GET 与 POST' } })
        return
      }
      const body = await readBody(req)
      const action = String(body.action || url.searchParams.get('action') || '')
      const run = actions[action]
      if (!run) {
        send(res, 404, { ok: false, error: { code: 'unknown_action', message: '未知操作：' + action } })
        return
      }
      send(res, 200, { ok: true, data: await run(body.payload || body) })
    } catch (error) {
      const status = statusFor(error)
      if (status >= 500) console.error('[demographic-coder]', error)
      send(res, status, {
        ok: false,
        error: { code: error && error.code ? error.code : 'error', message: String(error && error.message ? error.message : error) }
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
