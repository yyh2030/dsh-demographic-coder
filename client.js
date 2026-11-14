/**
 * demographic-coder — browser half.
 *
 * A demographic-variable workbench that lives beside the conversation:
 * import Excel / Word / CSV questionnaires (categories are read from the
 * file), key the same variables in as a fill-in form for paper rounds, then
 * export a coded CSV plus its codebook and a JSON snapshot into the folder
 * the user picks.
 *
 * Parsing happens in the page (zip + XML, no dependency). The local Host
 * owns revisioned storage and writes explicit exports.
 */
/* @dsh-generated: client-identity prelude begin */
;(function (global) {
  if (global.__DSH_RESEARCH_CLIENT_IDENTITY__) return

const DSH_RESEARCH_CLIENT_IDENTITY = (function () {
  const IDENTITY_VERSION = '2026-11-10-u02'
  /** 共享键：同一标签里四个插件都读它，保证 pageId 一致。 */
  const PAGE_KEY = 'dsh:research:page:v3'
  /** 每个插件自己的键：键名含插件前一等公民前缀，便于诊断与单独清理。 */
  const PAGE_KEY_PREFIX = 'dsh:research:page:v3:plugin'
  const WORKSPACE_KEY = 'dsh:research:workspace:v3'
  const REVISION_KEY = 'dsh:research:page-revision:v3'
  const TAB_CHANNEL = 'dsh-research-tab-v3'
  const GLOBAL_KEY = '__DSH_RESEARCH_CLIENT_IDENTITY__'
  const PAGE_ID_RE = /^[A-Za-z0-9_-]{8,80}$/
  const PROBE_TIMEOUT_MS = 60
  /** 同一 realm（一个标签页）里所有插件共用的随机标签指纹，用来区分同标签兄弟与克隆标签。 */
  const tabNonce = randomToken()

  function randomToken(length) {
    const bytes = new Uint8Array(Math.ceil((length || 24) / 2))
    const cryptoSource = typeof globalThis !== 'undefined' ? globalThis.crypto : null
    if (cryptoSource && typeof cryptoSource.getRandomValues === 'function') cryptoSource.getRandomValues(bytes)
    else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
    return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
  }

  function randomPageId() { return randomToken(24) }

  function isPageId(value) { return typeof value === 'string' && PAGE_ID_RE.test(value) }

  function pluginPageKey(plugin) {
    const name = String(plugin || 'unknown').trim() || 'unknown'
    return PAGE_KEY_PREFIX + ':' + name
  }

  function safeSegment(value) {
    const text = String(value === null || value === undefined ? '' : value).trim()
    if (!text) return 'none'
    return text.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 96) || 'none'
  }

  /** 数据集标识：优先 dataRoot，其次研究定义路径，最后 studyId；只用于草稿键隔离。 */
  function datasetKey(binding) {
    if (!binding || typeof binding !== 'object') return 'none'
    return safeSegment(binding.dataRoot || binding.studyPath || binding.dataset || binding.studyId || 'none')
  }

  function instanceKey(binding) {
    return safeSegment(binding && (binding.instanceId || binding.studyId) || 'none')
  }

  /** study-ops 写到 scale-desk 的焦点提示：同一研究实例 + 同一数据集才复用。 */
  function focusKey(binding) {
    return 'dsh:research:focus:v2:' + instanceKey(binding) + ':' + datasetKey(binding)
  }

  /** analysis-run 方案草稿：实例 + 数据集（dataPath），不能只按 studyId 存。 */
  function planDraftKey(binding, dataPath, studyId) {
    return 'analysis-plan:v2:' + instanceKey(binding) + ':' + safeSegment(studyId || (binding && binding.studyId)) + ':' + safeSegment(dataPath || datasetKey(binding))
  }

  /** demographic-coder 数据集草稿：实例 + 数据集名。 */
  function datasetDraftKey(prefix, binding, dataset) {
    return String(prefix || 'dc:dataset:v3') + ':' + instanceKey(binding) + ':' + safeSegment(dataset || datasetKey(binding))
  }

  /**
   * 从 Client Slot/Service 契约读取当前标签所属工作区。
   * 只读 uiWorkspace 的当前会话与工作区成员关系；拿不到就返回 null，绝不猜 cwd。
   */
  function workspaceFromContext(ctx) {
    try {
      if (!ctx || typeof ctx.get !== 'function') return null
      const ui = ctx.get('uiWorkspace')
      if (!ui) return null
      const selection = ui.selection && typeof ui.selection.getSnapshot === 'function' ? ui.selection.getSnapshot() : null
      const sessionId = selection && selection.sessionId
      const snapshot = ui.workspaces && ui.workspaces.list && typeof ui.workspaces.list.getSnapshot === 'function' ? ui.workspaces.list.getSnapshot() : null
      const items = snapshot && Array.isArray(snapshot.items) ? snapshot.items : []
      let workspace = null
      if (sessionId) workspace = items.find(item => item && Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) || null
      if (!workspace && selection && selection.workspaceId) workspace = items.find(item => item && item.workspaceId === selection.workspaceId) || null
      if (!workspace) return null
      return { id: workspace.workspaceId || '', path: workspace.path || '' }
    } catch { return null }
  }

  function safeStorage(global) {
    try { return global && global.sessionStorage ? global.sessionStorage : null } catch { return null }
  }

  function createClientIdentity(options) {
    const settings = options || {}
    const global = settings.global || (typeof globalThis !== 'undefined' ? globalThis : null)
    const plugin = String(settings.plugin || 'unknown')
    const storage = settings.storage !== undefined ? settings.storage : safeStorage(global)
    // 只从页面 window（或显式注入）取 BroadcastChannel；Node 测试进程的全局实现
    // 不能被误当成浏览器标签能力，否则测试/宿主进程会被常驻通道挂住。
    const broadcastFactory = settings.BroadcastChannel || (global && global.BroadcastChannel) || null
    const workspaceProvider = settings.workspaceProvider || null
    const random = typeof settings.random === 'function' ? settings.random : randomPageId
    const tabId = settings.tabId || tabNonce
    const pageKey = pluginPageKey(plugin)
    let pageId = ''
    let workspace = null
    let revision = 0
    let binding = null
    let readyPromise = null
    let channel = null

    function read(key) {
      try { return storage && typeof storage.getItem === 'function' ? String(storage.getItem(key) || '') : '' } catch { return '' }
    }
    function write(key, value) {
      try { if (storage && typeof storage.setItem === 'function') storage.setItem(key, String(value)); return true } catch { return false }
    }
    function remove(key) { try { if (storage && typeof storage.removeItem === 'function') storage.removeItem(key) } catch { /* ignore */ } }

    function workspaceStorageKey(id) { return WORKSPACE_KEY + ':' + id }
    function revisionStorageKey(id) { return REVISION_KEY + ':' + id }

    function readWorkspace() {
      const raw = read(workspaceStorageKey(pageId))
      if (!raw) return null
      try {
        const value = JSON.parse(raw)
        return value && typeof value === 'object' ? { id: String(value.id || ''), path: String(value.path || '') } : null
      } catch { return null }
    }
    function readRevision() {
      const value = Number(read(revisionStorageKey(pageId)))
      return Number.isFinite(value) && value >= 0 ? value : 0
    }
    function persistWorkspace() {
      if (!pageId) return
      if (workspace) write(workspaceStorageKey(pageId), JSON.stringify(workspace))
      else remove(workspaceStorageKey(pageId))
      write(revisionStorageKey(pageId), String(revision))
    }

    function normalizeWorkspace(value) {
      if (!value) return null
      if (typeof value === 'string') return { id: value.trim(), path: '' }
      const id = String(value.id || value.workspaceId || '').trim()
      const path = typeof value.path === 'string' ? value.path.trim() : ''
      if (!id && !path) return null
      return { id, path }
    }

    function installChannel() {
      if (channel || !broadcastFactory) return
      try {
        channel = new broadcastFactory(TAB_CHANNEL)
        if (typeof channel.addEventListener === 'function') {
          channel.addEventListener('message', event => {
            const message = event && event.data ? event.data : event
            if (!message || message.type !== 'identity-probe' || !message.nonce) return
            // 同一标签的四个兄弟共用一个 tab 指纹，不能互相判成克隆；只回答其他标签的探测。
            if (message.tab === tabId) return
            if (message.pageId !== pageId) return
            try { channel.postMessage({ type: 'identity-alive', pageId, nonce: message.nonce }) } catch { /* ignore */ }
          })
        }
      } catch { channel = null }
    }

    /** 克隆标签会复制 sessionStorage；用 BroadcastChannel 问一下这个 pageId 是否已在别的标签活着。 */
    async function contested(id) {
      if (!broadcastFactory) return false
      let probe = null
      try { probe = new broadcastFactory(TAB_CHANNEL) } catch { return false }
      return await new Promise(resolve => {
        let settled = false
        const nonce = random()
        const finish = value => {
          if (settled) return
          settled = true
          try { if (probe && typeof probe.close === 'function') probe.close() } catch { /* ignore */ }
          resolve(value)
        }
        if (typeof probe.addEventListener === 'function') {
          probe.addEventListener('message', event => {
            const message = event && event.data ? event.data : event
            if (message && message.type === 'identity-alive' && message.pageId === id && message.nonce === nonce) finish(true)
          })
        }
        try { probe.postMessage({ type: 'identity-probe', pageId: id, nonce, tab: tabId }) } catch { finish(false); return }
        setTimeout(() => finish(false), PROBE_TIMEOUT_MS)
      })
    }

    function ready() {
      if (readyPromise) return readyPromise
      readyPromise = (async () => {
        const storedPlugin = read(pageKey)
        const storedShared = read(PAGE_KEY)
        // 共享键优先：四个插件以它为唯一事实；插件键只做诊断/清理辅助。
        let candidate = isPageId(storedShared) ? storedShared : (isPageId(storedPlugin) ? storedPlugin : '')
        // 同标签的兄弟插件已经通过共享内存确认过这个身份，不必再互探。
        if (candidate && candidate !== memoryPageId() && await contested(candidate)) candidate = ''
        if (!candidate) {
          candidate = isPageId(memoryPageId()) ? memoryPageId() : random()
          // 进程内唯一 ID：同一标签的四个插件通过共享内存拿到同一个值，克隆/无 storage 时也彼此不同。
          setMemoryPageId(candidate)
          write(pageKey, candidate)
          write(PAGE_KEY, candidate)
        } else {
          setMemoryPageId(candidate)
          if (storedPlugin !== candidate) write(pageKey, candidate)
          if (storedShared !== candidate) write(PAGE_KEY, candidate)
        }
        pageId = candidate
        if (!workspace) workspace = readWorkspace()
        revision = Math.max(revision, readRevision())
        installChannel()
        return pageId
      })()
      return readyPromise
    }

    // 进程内单例挂在全局 API 上：四个插件 bundle 共用同一个 API 实例时通过它对齐。
    function memoryPageId() {
      try { return global && global.__DSH_RESEARCH_PAGE_MEMORY__ ? String(global.__DSH_RESEARCH_PAGE_MEMORY__) : '' } catch { return '' }
    }
    function setMemoryPageId(value) {
      try { if (global) global.__DSH_RESEARCH_PAGE_MEMORY__ = value } catch { /* ignore */ }
    }

    /** 同标签任一插件 newPage 后，其他插件下次请求前要采纳新的共享 pageId。 */
    function syncPageFromGlobal() {
      const sharedMemory = memoryPageId()
      if (!isPageId(sharedMemory) || sharedMemory === pageId) return
      pageId = sharedMemory
      workspace = readWorkspace()
      revision = readRevision()
      binding = null
    }

    function ensure() {
      syncPageFromGlobal()
      if (!pageId) {
        // 同步路径也不能覆盖已持久化的身份；只有确实没有候选时才生成。
        const storedShared = read(PAGE_KEY)
        const storedPlugin = read(pageKey)
        const stored = isPageId(storedShared) ? storedShared : (isPageId(storedPlugin) ? storedPlugin : '')
        pageId = stored || (isPageId(memoryPageId()) ? memoryPageId() : random())
        setMemoryPageId(pageId)
        if (!stored) write(PAGE_KEY, pageId)
        if (storedPlugin !== pageId) write(pageKey, pageId)
        if (!workspace) workspace = readWorkspace()
        revision = Math.max(revision, readRevision())
      }
      return pageId
    }

    function syncWorkspace(ctx) {
      if (typeof workspaceProvider !== 'function' || !pageId) return workspace
      let next = null
      try { next = workspaceProvider(ctx) } catch { next = null }
      return setWorkspace(next)
    }

    function setWorkspace(next) {
      const normalized = normalizeWorkspace(next)
      if (!normalized) return workspace
      if (workspace && workspace.id === normalized.id && workspace.path === normalized.path) return workspace
      if (workspace) {
        // 同标签切换工作区：绑定代次递增，旧令牌作废。
        revision += 1
        binding = null
      }
      workspace = normalized
      persistWorkspace()
      return workspace
    }

    function newPage() {
      const next = random()
      pageId = next
      setMemoryPageId(next)
      revision = 0
      binding = null
      write(pageKey, next)
      write(PAGE_KEY, next)
      persistWorkspace()
      installChannel()
      return next
    }

    function prepare(ctx) {
      syncPageFromGlobal()
      ensure()
      if (typeof workspaceProvider === 'function') syncWorkspace(ctx)
      return begin()
    }

    function begin() {
      ensure()
      return {
        pageId,
        workspaceId: workspace ? workspace.id : '',
        workspacePath: workspace ? workspace.path : '',
        bindingRevision: revision,
        studyId: binding ? binding.studyId || '' : '',
        instanceId: binding ? binding.instanceId || '' : '',
        token: binding ? binding.token || '' : '',
      }
    }

    function headers() {
      ensure()
      const result = { 'x-dsh-page': pageId }
      if (workspace && workspace.id) result['x-dsh-workspace'] = workspace.id
      return result
    }

    function body() {
      ensure()
      const result = { pageId, bindingRevision: revision }
      if (workspace && workspace.id) result.workspaceId = workspace.id
      // 写入令牌必须随请求体发送：连接/读取响应会 remember() 令牌，但只有 body 带上它，
      // 服务端 assertWrite 才会认为这是当前页面的绑定（否则页面永远 binding_required）。
      if (binding && binding.token) result.binding = binding.token
      return result
    }

    function capture() { return begin() }

    function remember(nextBinding) {
      if (!nextBinding || typeof nextBinding !== 'object' || !nextBinding.token) return binding
      binding = {
        token: String(nextBinding.token),
        studyId: nextBinding.studyId || (nextBinding.study && nextBinding.study.id) || '',
        instanceId: nextBinding.instanceId || (nextBinding.study && nextBinding.study.instanceId) || '',
        studyRevision: nextBinding.studyRevision || (nextBinding.study && nextBinding.study.revision) || '',
        bindingRevision: Number(nextBinding.bindingRevision) || 0,
        workspaceId: nextBinding.workspaceId || '',
      }
      return binding
    }

    function staleError(message, details) {
      const error = new Error(message)
      error.code = 'stale_response'
      error.details = details
      return error
    }

    /**
     * 响应回来后核对本次 capture：页面、工作区代次或研究身份变了就拒绝，
     * 由调用方丢弃这次结果，不能覆盖新页面状态。
     */
    function assertResponse(snapshot, responseBinding, options) {
      if (!snapshot) return true
      if (snapshot.pageId !== pageId) throw staleError('页面身份已变化，忽略过时响应', { pageId, expected: snapshot.pageId })
      if (snapshot.bindingRevision !== revision) throw staleError('页面绑定已切换，忽略过时响应', { bindingRevision: revision, expected: snapshot.bindingRevision })
      const workspaceId = workspace ? workspace.id : ''
      if ((snapshot.workspaceId || '') !== workspaceId) throw staleError('页面工作区已切换，忽略过时响应', { workspaceId, expected: snapshot.workspaceId })
      if (responseBinding && typeof responseBinding === 'object') {
        const allowRebind = options && options.allowRebind === true
        const responseStudy = responseBinding.studyId || (responseBinding.study && responseBinding.study.id) || ''
        const responseInstance = responseBinding.instanceId || (responseBinding.study && responseBinding.study.instanceId) || ''
        const responseWorkspace = responseBinding.workspaceId || ''
        if (responseWorkspace && workspaceId && responseWorkspace !== workspaceId) {
          throw staleError('响应来自其他工作区，已丢弃', { workspaceId, responseWorkspace })
        }
        if (!allowRebind) {
          if (snapshot.studyId && responseStudy && snapshot.studyId !== responseStudy) {
            throw staleError('响应属于其他研究，已丢弃', { studyId: responseStudy, expected: snapshot.studyId })
          }
          if (snapshot.instanceId && responseInstance && snapshot.instanceId !== responseInstance) {
            throw staleError('响应属于其他研究实例，已丢弃', { instanceId: responseInstance, expected: snapshot.instanceId })
          }
        }
      }
      return true
    }

    function accept(snapshot, responseBinding, options) {
      assertResponse(snapshot, responseBinding, options)
      return remember(responseBinding)
    }

    // 首次创建就落盘：隐私模式下也会落到本标签的进程内单例。
    void ready().catch(() => {})

    return {
      version: IDENTITY_VERSION,
      plugin,
      ready,
      ensure,
      pageId() { return ensure() },
      newPage,
      prepare,
      begin,
      syncWorkspace,
      setWorkspace,
      workspace() { return workspace ? { ...workspace } : null },
      revision() { return revision },
      headers,
      body,
      capture,
      remember,
      binding() { return binding ? { ...binding } : null },
      assertResponse,
      accept,
      focusKey() { return focusKey(binding) },
      planDraftKey(dataPath) { return planDraftKey(binding, dataPath, binding && binding.studyId) },
      datasetDraftKey(prefix, dataset) { return datasetDraftKey(prefix, binding, dataset) },
      staleError,
    }
  }

  return {
    IDENTITY_VERSION,
    PAGE_KEY,
    PAGE_KEY_PREFIX,
    WORKSPACE_KEY,
    REVISION_KEY,
    TAB_CHANNEL,
    GLOBAL_KEY,
    randomPageId,
    isPageId,
    pluginPageKey,
    safeSegment,
    datasetKey,
    instanceKey,
    focusKey,
    planDraftKey,
    datasetDraftKey,
    workspaceFromContext,
    createClientIdentity,
  }
})()
  global.__DSH_RESEARCH_CLIENT_IDENTITY__ = DSH_RESEARCH_CLIENT_IDENTITY
})(typeof window !== 'undefined' ? window : globalThis)
/* @dsh-generated: client-identity prelude end */








/* @dsh-generated: study-picker prelude begin */
;(function (global) {
  if (global.__DSH_RESEARCH_PICKER__) return

function createStudyPicker(options) {
  const route = options.route
  const headers = options.headers || (() => ({}))
  const pickDirectory = options.pickDirectory || null
  const onChanged = options.onChanged || (() => {})
  const plugin = options.plugin || 'research'
  let root = null
  let panel = null
  let choices = null
  let note = ''
  let busy = false
  let advanced = false
  let creating = false
  let targetDir = ''
  let chooseDir = null

  async function api(action, payload, method = 'POST') {
    const url = method === 'GET' ? `${route}?action=${encodeURIComponent(action)}` : route
    const response = await fetch(url, {
      method,
      headers: { ...headers(), 'content-type': 'application/json' },
      body: method === 'POST' ? JSON.stringify({ action, payload: payload || {} }) : undefined,
    })
    let data = null
    try { data = await response.json() } catch { data = null }
    if (!response.ok || !data || data.ok === false) {
      const message = data && data.error && (data.error.message || data.error.note) ? (data.error.message || data.error.note) : `请求失败（${response.status}）`
      throw new Error(message)
    }
    return data.data
  }

  const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag)
    for (const [key, value] of Object.entries(props || {})) {
      if (key === 'style') { if (node.style) for (const [name, style] of Object.entries(value)) node.style[name] = style }
      else if (key === 'onClick') node.addEventListener('click', value)
      else if (key === 'className') node.className = value
      else if (key === 'text') node.textContent = value
      else if (key === 'value') node.value = value
      else if (key === 'placeholder') node.placeholder = value
      else node.setAttribute(key, value)
    }
    for (const child of children) if (child != null) node.append(child)
    return node
  }

  const buttonStyle = {
    height: '30px', padding: '0 10px', border: '1px solid #cdc7b7', borderRadius: '5px',
    background: '#fffefb', color: '#24221f', cursor: 'pointer', font: 'inherit', fontSize: '13px',
  }
  const rowStyle = { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderBottom: '1px solid #eceade', cursor: 'pointer', width: '100%', background: 'transparent', border: 'none', textAlign: 'left', font: 'inherit' }

  function stateLabel(row) {
    if (row.state === 'ok') return '已存在'
    if (row.state === 'missing') return '需重新定位'
    if (row.state === 'invalid') return '配置损坏'
    return '未知'
  }

  function render() {
    if (!panel) return
    panel.textContent = ''
    const recent = (choices && choices.recent) || []
    const scope = (choices && choices.scope) || {}
    const binding = (choices && choices.binding) || {}
    const head = el('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' } },
      el('strong', { text: '打开研究' }),
      el('button', { style: buttonStyle, text: '关闭', onClick: close }),
    )
    const scopeBox = el('div', { style: { background: '#f2f0e9', borderRadius: '6px', padding: '8px 10px', fontSize: '12.5px', color: '#5b564d', lineHeight: '1.7' } },
      el('div', { text: `当前页面：${binding.studyId || '未绑定'}` }),
      el('div', { text: `当前工作区：${scope.workspace ? (scope.workspace.path || scope.workspace.id || '已识别') : '未识别'}` }),
      el('div', { text: `当前会话：${scope.kind === 'agent' ? (scope.session || '已识别') : '页面切换不改变 Agent 研究'}` }),
    )
    const list = el('div', { style: { maxHeight: '230px', overflow: 'auto', border: '1px solid #eceade', borderRadius: '6px', marginTop: '10px' } })
    if (!recent.length) list.append(el('div', { style: { padding: '12px', color: '#726c62' }, text: '暂无最近研究。选择研究文件夹或新建研究。' }))
    for (const row of recent) {
      const item = el('button', { style: { ...rowStyle, opacity: row.state === 'missing' ? '0.65' : '1' }, onClick: () => select(row) },
        el('span', { style: { flex: '1 1 auto', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, text: `${row.name || row.studyId || row.studyPath}` }),
        el('span', { style: { color: '#726c62', fontSize: '12px' }, text: row.current ? '当前' : stateLabel(row) }),
      )
      if (row.current) item.style.background = '#f4e5dd'
      list.append(item)
    }
    const actions = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
      el('button', { style: buttonStyle, text: '选择研究文件夹…', onClick: chooseFolder }),
      el('button', { style: buttonStyle, text: '新建研究…', onClick: () => { creating = true; advanced = false; render() } }),
      el('button', { style: buttonStyle, text: '高级', onClick: () => { advanced = !advanced; creating = false; render() } }),
    )
    const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, head, scopeBox, list, actions)
    if (creating) body.append(createForm())
    if (advanced) body.append(advancedForm())
    if (note) body.append(el('div', { style: { color: '#9b3a2c', fontSize: '12.5px' }, text: note }))
    panel.append(body)
  }

  function createForm() {
    const name = el('input', { placeholder: '研究名称', value: '', style: { height: '30px', padding: '0 8px', border: '1px solid #cdc7b7', borderRadius: '5px', font: 'inherit' } })
    const dirText = el('span', { style: { color: '#5b564d', fontSize: '12.5px', wordBreak: 'break-all' }, text: targetDir || '尚未选择父目录' })
    const choose = el('button', { style: buttonStyle, text: '选择父目录…', onClick: async () => {
      const dir = await chooseFolderPath()
      if (!dir) return
      targetDir = dir; render()
    } })
    const create = el('button', { style: { ...buttonStyle, background: '#a55a3c', color: '#fdfbf7', borderColor: '#a55a3c' }, text: '创建并连接', onClick: async () => {
      if (busy) return
      const title = String(name.value || '').trim()
      if (!title) { note = '请填写研究名称'; render(); return }
      if (!targetDir) { note = '请选择父目录'; render(); return }
      busy = true; note = ''
      try {
        const payload = { studyPath: joinPath(targetDir, 'study.json'), name: title }
        await api('studyCreate', payload)
        await finishSwitch()
      } catch (error) { note = error.message; busy = false; render() }
    } })
    return el('div', { style: { border: '1px solid #eceade', borderRadius: '6px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' } },
      el('strong', { text: '新建研究' }), name, dirText, el('div', { style: { display: 'flex', gap: '8px' } }, choose, create))
  }

  function advancedForm() {
    const input = el('input', { placeholder: 'study.json 的绝对路径', style: { flex: '1 1 auto', height: '30px', padding: '0 8px', border: '1px solid #cdc7b7', borderRadius: '5px', font: 'inherit' } })
    const connect = el('button', { style: buttonStyle, text: '连接', onClick: async () => {
      if (busy) return
      if (!input.value.trim()) { note = '请填写研究定义路径'; render(); return }
      busy = true; note = ''
      try { await api('studyConnect', { studyPath: input.value.trim() }); await finishSwitch() }
      catch (error) { note = error.message; busy = false; render() }
    } })
    return el('div', { style: { border: '1px solid #eceade', borderRadius: '6px', padding: '10px', display: 'flex', gap: '8px' } }, input, connect)
  }

  function joinPath(dir, name) {
    const clean = String(dir).replace(/[\\/]+$/, '')
    return `${clean}/${name}`
  }

  async function chooseFolderPath() {
    if (!pickDirectory) { note = '当前宿主未提供目录选择，请使用高级路径'; render(); return null }
    try { return await pickDirectory() } catch (error) { note = error.message || '目录选择已取消'; render(); return null }
  }

  async function chooseFolder() {
    const dir = await chooseFolderPath()
    if (!dir) return
    busy = true; note = ''
    try {
      const found = await api('studyDiscover', { dir })
      const configs = (found && found.configs) || []
      if (!configs.length) {
        targetDir = dir; creating = true; advanced = false
        note = '此文件夹没有研究配置，可以新建研究。'
      } else if (configs.length === 1) {
        await api('studyConnect', { studyPath: configs[0].studyPath })
        await finishSwitch()
        return
      } else {
        choices = null
        showConfigs(configs)
        busy = false
        return
      }
    } catch (error) { note = error.message }
    busy = false
    render()
  }

  function showConfigs(configs, relocateId = null) {
    if (!panel) return
    panel.textContent = ''
    panel.append(
      el('strong', { text: relocateId ? '选择重新定位后的研究配置' : '此文件夹有多个研究配置，请选择' }),
      el('div', { style: { margin: '10px 0', border: '1px solid #eceade', borderRadius: '6px' } },
        ...configs.map(row => el('button', { style: rowStyle, onClick: async () => {
          if (!row.valid) { note = '这个配置无效：' + (row.problems || []).join('；'); render(); return }
          try {
            if (relocateId) await api('studyRelocate', { instanceId: relocateId, studyPath: row.studyPath })
            else await api('studyConnect', { studyPath: row.studyPath })
            await finishSwitch()
          } catch (error) { note = error.message; busy = false; render() }
        } },
          el('span', { style: { flex: '1 1 auto' }, text: `${row.name || row.studyId || row.relativePath}` }),
          el('span', { style: { color: row.valid ? '#3f6b4f' : '#9b3a2c', fontSize: '12px' }, text: row.valid ? row.relativePath : '无效' }),
        ))
      ),
      el('button', { style: buttonStyle, text: '返回', onClick: () => { choices = null; refresh(); render() } }),
    )
  }

  async function select(row) {
    if (row.state === 'missing') {
      if (!row.instanceId) { note = '该研究没有实例记录，请选择文件夹或高级路径连接'; advanced = true; render(); return }
      const dir = await chooseFolderPath()
      if (!dir) return
      busy = true; note = ''
      try {
        const found = await api('studyDiscover', { dir })
        const configs = (found && found.configs) || []
        if (!configs.length) { note = '此文件夹没有研究配置'; busy = false; render(); return }
        if (configs.length > 1) { showConfigs(configs, row.instanceId); return }
        await api('studyRelocate', { instanceId: row.instanceId, studyPath: configs[0].studyPath })
        await finishSwitch()
      } catch (error) { note = error.message; busy = false; render() }
      return
    }
    if (!row.studyPath) return
    busy = true; note = ''
    try { await api('studyConnect', { studyPath: row.studyPath }); await finishSwitch() }
    catch (error) { note = error.message; busy = false; render() }
  }

  async function finishSwitch() {
    busy = false
    let name = ''
    try { choices = await api('studyChoices'); const current = (choices.recent || []).find(row => row.current); name = (current && (current.name || current.studyId)) || '' } catch { /* 名称稍后刷新 */ }
    close()
    updateButton()
    showToast(name)
    onChanged()
  }

  function showToast(name) {
    const toast = el('div', {
      style: {
        position: 'fixed', right: '24px', bottom: '28px', zIndex: '2147483100', maxWidth: '420px',
        background: '#24221f', color: '#fdfbf7', borderRadius: '8px', padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: '10px', font: '13px Cambria, serif',
        boxShadow: '0 10px 26px rgba(0,0,0,.25)',
      },
    },
      el('span', { style: { flex: '1 1 auto' }, text: name ? `已切换到：${name}` : '已切换研究' }),
      el('button', { style: { ...buttonStyle, height: '26px', background: '#fdfbf7' }, text: '刷新面板', onClick: () => { try { window.location.reload() } catch { /* 无窗口 */ } } }),
      el('button', { style: { ...buttonStyle, height: '26px', background: 'transparent', color: '#fdfbf7', borderColor: '#5b564d' }, text: '稍后', onClick: () => toast.remove() }),
    )
    document.body.append(toast)
    setTimeout(() => { try { toast.remove() } catch { /* 已移除 */ } }, 12000)
  }

  async function refresh() {
    try { choices = await api('studyChoices') } catch (error) { choices = null; note = error.message }
    updateButton()
    if (panel) render()
  }

  function updateButton() {
    if (!root) return
    const current = choices && choices.binding && choices.binding.studyId
    const nameRow = choices && choices.recent && choices.recent.find(row => row.current)
    root.textContent = `研究：${(nameRow && (nameRow.name || nameRow.studyId)) || current || '未绑定'} ▾`
  }

  function close() {
    if (panel) { panel.remove(); panel = null }
  }

  function open() {
    if (panel) { close(); return }
    panel = el('div', {
      style: {
        position: 'fixed', bottom: '108px', right: '24px', width: '540px', maxWidth: 'calc(100vw - 48px)',
        maxHeight: 'calc(100vh - 200px)', overflow: 'auto', zIndex: '2147483000', background: '#fbfaf6',
        border: '1px solid #cdc7b7', borderRadius: '10px', padding: '14px', boxShadow: '0 18px 50px rgba(0,0,0,.22)',
        fontFamily: 'Cambria, "Noto Serif SC", serif', color: '#24221f', fontSize: '14px',
      },
    })
    document.body.append(panel)
    refresh()
  }

  function install() {
    if (root) return root
    if (typeof window !== 'undefined' && window.__DSH_RESEARCH_PICKER_INSTANCE__) return window.__DSH_RESEARCH_PICKER_INSTANCE__
    if (!document.body || typeof document.body.appendChild !== 'function' || !document.createElement) return null
    root = el('button', {
      style: {
        position: 'fixed', bottom: '64px', right: '24px', zIndex: '2147482000',
        height: '30px', padding: '0 12px', border: '1px solid #cdc7b7', borderRadius: '999px',
        background: '#fffefb', color: '#24221f', cursor: 'pointer', font: 'inherit', fontSize: '13px',
        boxShadow: '0 2px 10px rgba(0,0,0,.08)',
      },
      text: '研究：加载中…',
      title: `${plugin} 当前研究`,
    })
    root.addEventListener('click', open)
    document.body.append(root)
    // 面板只在研究插件页打开时自动关闭；入口按钮始终可见，避免被误判为“消失”。
    setInterval(() => {
      if (!panel) return
      try { if (!document.querySelector('.so-pagehead,.sd-root,.dc-root,.ar-pagehead')) close() } catch { close() }
    }, 800)
    refresh()
    if (typeof window !== 'undefined') window.__DSH_RESEARCH_PICKER_INSTANCE__ = pickerApi
    return root
  }

  const pickerApi = { install, open, close, refresh, get state() { return choices } }
  return pickerApi
}

const DSH_RESEARCH_PICKER = { createStudyPicker }
  global.__DSH_RESEARCH_PICKER__ = DSH_RESEARCH_PICKER
})(typeof window !== 'undefined' ? window : globalThis)
/* @dsh-generated: study-picker prelude end */









window.__ModuleLoader__.load({
  id: '@local/demographic-coder',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React

    const API = '/api/demographic-coder'
    const LS_DIR = 'dc:dir:v1'
    const LS_TAB = 'dc:tab:v1'

    /* ================================================================== *
     * copy
     * ================================================================== */

    const EN = {
      人口学变量: 'Demographics',
      录入: 'Entry',
      数据: 'Data',
      编码: 'Coding',
      导入: 'Import',
      数据表: 'Data table',
      导入与新建: 'Import & new',
      变量与编码: 'Variables & codes',
      导入文件: 'Import file',
      保存CSV: 'Save CSV',
      下载CSV: 'Download CSV',
      打开文件夹: 'Open folder',
      复制路径: 'Copy path',
      保存位置: 'Save location',
      保存并继续: 'Save & next',
      清空: 'Clear',
      撤销上一份: 'Undo last',
      第N份问卷: 'Response {n}',
      被试编号: 'Participant ID',
      已录入: '{n} responses',
      变量: '{n} variables',
      已编码: '{n} coded',
      未编码: 'Uncoded',
      必填: 'Required',
      变量名: 'Variable',
      标签: 'Label',
      类型: 'Type',
      分类: 'Categorical',
      数值: 'Number',
      文本: 'Text',
      自动识别: 'Auto-detect',
      自动编码: 'Auto-code',
      清除映射: 'Clear mapping',
      添加变量: 'Add variable',
      删除: 'Delete',
      删除此行: 'Delete row',
      添加一行: 'Add row',
      显示编码值: 'Show codes',
      显示原始值: 'Show raw',
      搜索: 'Search',
      没有数据: 'No data yet',
      从模板开始: 'Start from a template',
      基础人口学: 'Core demographics',
      学生样本: 'Student sample',
      空白数据集: 'Blank dataset',
      拖入文件: 'Drop a file here',
      或点击选择文件: 'or click to choose a file',
      支持格式: 'Excel .xlsx · Word .docx · CSV',
      表头行: 'Header row',
      工作表: 'Sheet',
      行: '{n} rows',
      列: '{n} columns',
      导入并替换: 'Import & replace',
      追加到现有数据: 'Append to current data',
      检测到编码表: 'Codebook sheet detected',
      已套用编码表: 'Codebook applied to matching variables',
      请先选择文件: 'Choose a file first',
      解析失败: 'Could not read the file',
      保存成功: 'Saved',
      保存失败: 'Save failed',
      已复制: 'Copied',
      已下载: 'Downloaded',
      提示: 'Tip',
      按Tab逐项填写: 'Tab through the blanks, Enter saves and starts the next response',
      编码预览: 'Coded preview',
      最近录入: 'Recent responses',
      与第N份相同: 'Identical to response {n}',
      再按一次确认: 'press save again to keep it',
      至少填写一项: 'Fill in at least one field',
      清空当前表单: 'Clear this form',
      尚无变量: 'No variables yet',
      导入问卷或选择模板后即可录入: 'Import a questionnaire or pick a template to start',
      分类变量: 'Categorical variables',
      数值变量: 'Numeric variables',
      文本变量: 'Text variables',
      所有值: 'values',
      原始值: 'Raw',
      编码值: 'Code',
      设为分类: 'Set categorical',
      设为数值: 'Set numeric',
      设为文本: 'Set text',
      缺失值: 'Missing value',
      留空: 'blank',
      重新解析: 'Re-parse',
      取消: 'Cancel',
      确认替换: 'Replace current data?',
      当前已有N份: 'There are {n} responses',
      替换会清空: 'Replacing clears them; import and append keeps them.',
      未找到表格: 'No table found in this document',
      段落实录入: 'Paragraph answers read as one response',
      文件名: 'File',
      保存到: 'Saves to',
      设置保存位置: 'Set the folder in Import',
      正在保存: 'Saving…',
      正在解析: 'Reading…',
      数据来源: 'Source',
      本机处理: 'Parsed in this page, nothing uploaded',
      复制一个文件: 'Add a field to extend the form',
      该值不会编码: 'this value has no code',
      按词典: 'from dictionary',
      手册: 'codebook',
      列: 'columns',
      行数: 'rows',
      导入须知: 'Word tables become responses, Excel sheets become variables; the first row is the header.',
      问卷编号: 'Response ID',
      从第份开始: 'IDs start at',
      清空全部数据: 'Clear all data',
      将删除N份: 'Delete all {n} responses?',
      确认删除: 'Delete',
      变量为空: 'Add variables first',
      删除变量: 'Delete variable',
      变量已存在: 'That label already exists'
    }

    function translator(active) {
      const en = String(active || '').toLowerCase().startsWith('zh') ? null : EN
      return (text, vars) => {
        let out = (en && en[text]) || text
        if (vars) for (const [key, value] of Object.entries(vars)) out = out.split('{' + key + '}').join(String(value))
        return out
      }
    }
    const TContext = React.createContext(text => text)

    /* ================================================================== *
     * coding dictionary — the "simple coding" for common demographics
     * ================================================================== */

    const RAW_DICT = [
      {
        id: 'sex',
        label: '性别',
        names: ['性别', 'sex', 'gender'],
        options: [['1', ['男', '男性', '男生', 'male', 'm', 'man']], ['2', ['女', '女性', '女生', 'female', 'f', 'woman']]]
      },
      {
        id: 'handedness',
        label: '是否右利手',
        names: ['是否右利手', '右利手', '利手', 'handedness', 'hand'],
        options: [['1', ['是', '右利手', '右手']], ['2', ['否', '非右利手', '左利手', '左手', '双手', '左右手']]]
      },
      { id: 'age', label: '年龄', names: ['年龄', 'age'], kind: 'number', options: [] },
      { id: 'birthDate', label: '出生日期', names: ['出生日期', '生日', 'birthdate', 'birth_date', 'dob'], kind: 'text', options: [] },
      { id: 'eduYears', label: '受教育年限', names: ['受教育年限', '教育年限', 'edu_years', 'eduyears'], kind: 'number', options: [] },
      {
        id: 'education',
        label: '教育程度',
        names: ['教育程度', '文化程度', '受教育程度', '学历', 'education', 'edu'],
        options: [
          ['1', ['小学及以下', '小学', '小学以下', '未上学', '文盲']],
          ['2', ['初中', '初一', '初二', '初三']],
          ['3', ['高中', '中专', '技校', '职高', '职业高中', '高一', '高二', '高三', '高中/中专', '高中及以下']],
          ['4', ['大专', '专科', '高职']],
          ['5', ['本科', '大学本科', '大学', '学士']],
          ['6', ['硕士', '硕士研究生', '研究生', '研一', '研二', '研三']],
          ['7', ['博士', '博士研究生', '博士生']]
        ]
      },
      {
        id: 'eduLevel',
        label: '最高学历',
        names: ['最高学历', '最高学历（包含在读）', '学历（包含在读）'],
        options: [
          ['1', ['高中及以下', '高中', '中专', '技校', '职高', '初中', '小学']],
          ['2', ['本科', '大学本科', '大学', '学士']],
          ['3', ['硕士研究生', '硕士', '研究生']],
          ['4', ['博士研究生', '博士', '博士生']]
        ]
      },
      {
        id: 'marital',
        label: '婚姻状况',
        names: ['婚姻状况', '婚姻状态', '婚姻', '婚否', 'marital', 'marriage'],
        options: [
          ['1', ['单身', '未婚', '未结婚']],
          ['2', ['已婚', '初婚', '再婚']],
          ['3', ['离异', '离婚']],
          ['4', ['丧偶']],
          ['5', ['其他']],
          ['6', ['恋爱', '恋爱中', '有伴侣']]
        ]
      },
      {
        id: 'hukou',
        label: '户口性质',
        names: ['户口性质', '户口', '户籍', 'hukou', 'household'],
        options: [['1', ['城镇', '城镇户口', '城市', '非农业', '非农业户口']], ['2', ['农村', '农村户口', '乡村', '农业', '农业户口']]]
      },
      {
        id: 'political',
        label: '政治面貌',
        names: ['政治面貌', '党派', 'political', 'party'],
        options: [
          ['1', ['群众']],
          ['2', ['共青团员', '团员']],
          ['3', ['中共党员', '党员', '中共预备党员', '预备党员']],
          ['4', ['民主党派']],
          ['5', ['其他']]
        ]
      },
      {
        id: 'ethnicity',
        label: '民族',
        names: ['民族', 'ethnicity', 'nation'],
        options: [['1', ['汉族', '汉']], ['2', ['少数民族', '其他民族']]]
      },
      { id: 'birthPlace', label: '出生地（长期成长地）', names: ['出生地', '长期成长地', '籍贯', 'birthplace', 'birth_place'], kind: 'text', options: [] },
      { id: 'currentResidence', label: '当前居住地', names: ['当前居住地', '现居住地', 'currentresidence', 'current_residence'], kind: 'text', options: [] },
      { id: 'fillDate', label: '填表日期', names: ['填表日期', '填写日期', 'fillingdate', 'fill_date'], kind: 'text', options: [] },
      {
        id: 'onlyChild',
        label: '是否独生子女',
        names: ['是否独生', '独生子女', '独生', 'onlychild', 'only_child'],
        options: [['1', ['是', '独生']], ['2', ['否', '非独生']]]
      },
      {
        id: 'grade',
        label: '年级',
        names: ['年级', 'grade'],
        options: [
          ['1', ['大一', '一年级']],
          ['2', ['大二', '二年级']],
          ['3', ['大三', '三年级']],
          ['4', ['大四', '四年级']],
          ['5', ['研一']],
          ['6', ['研二']],
          ['7', ['研三']],
          ['8', ['其他']],
          ['9', ['大五', '五年级']],
          ['10', ['博一']],
          ['11', ['博二']],
          ['12', ['博三']],
          ['13', ['博四']]
        ]
      },
      {
        id: 'residence',
        label: '生源地',
        names: ['生源地', '居住地', '户籍所在地', 'residence', 'hometown'],
        options: [['1', ['城市', '市区']], ['2', ['县城', '城镇']], ['3', ['乡镇']], ['4', ['农村', '乡村']]]
      },
      {
        id: 'yesno',
        label: '是否',
        names: [],
        options: [['1', ['是', '有', 'yes', 'y']], ['2', ['否', '无', 'no', 'n']]]
      }
    ]

    const CODING_DICT = RAW_DICT.map(entry => ({
      id: entry.id,
      label: entry.label,
      names: entry.names || [],
      kind: entry.kind || 'categorical',
      options: (entry.options || []).map(([code, labels]) => ({ code, label: labels[0], labels }))
    }))
    const CODING_BY_ID = Object.fromEntries(CODING_DICT.map(entry => [entry.id, entry]))

    const TEMPLATES = [
      {
        id: 'core',
        label: '基础人口学',
        vars: ['sex', 'age', 'education', 'marital', 'hukou', 'political', 'ethnicity', 'onlyChild']
      },
      {
        id: 'student',
        label: '学生样本',
        vars: ['sex', 'age', 'education', 'grade', 'residence', 'onlyChild', 'ethnicity', 'political']
      },
      { id: 'blank', label: '空白数据集', vars: [] }
    ]

    /* ================================================================== *
     * small helpers
     * ================================================================== */

    function normText(value) {
      return String(value == null ? '' : value).replace(/\u00a0/g, ' ').trim()
    }

    function normKey(value) {
      return normText(value).toLowerCase().replace(/[\s_\-（）()【】\[\]：:、，,.。？?/\\'"“”‘’]/g, '')
    }

    function isBlank(value) {
      return normText(value) === ''
    }

    function matchDictByLabel(label) {
      const key = normKey(label)
      if (!key) return null
      for (const entry of CODING_DICT) {
        for (const name of entry.names) if (key === normKey(name)) return entry
      }
      for (const entry of CODING_DICT) {
        if (entry.id === 'yesno') continue
        for (const name of entry.names) {
          const token = normKey(name)
          if (token.length >= 2 && key.includes(token)) return entry
        }
      }
      return null
    }

    function matchDictValue(entry, raw) {
      if (!entry || !entry.options || !entry.options.length) return null
      const value = normKey(raw)
      if (!value) return null
      for (const opt of entry.options) if (normKey(opt.code) === value) return opt.code
      for (const opt of entry.options) {
        for (const label of opt.labels) if (normKey(label) === value) return opt.code
      }
      return null
    }

    function suggestDictValue(entry, raw) {
      if (!entry || matchDictValue(entry, raw) != null) return []
      const value = normKey(raw)
      return entry.options.filter(option => option.labels.some(label => normKey(label).length > 1 && value.includes(normKey(label))))
    }

    function uniqueOf(values) {
      const seen = new Set()
      const out = []
      for (const value of values) {
        const text = normText(value)
        if (!text || seen.has(text)) continue
        seen.add(text)
        out.push(text)
      }
      return out
    }

    function codeOf(column, raw) {
      const value = normText(raw)
      if (!value) return column?.coding?.missing == null ? '' : String(column.coding.missing)
      const ignored = new Set((column?.coding?.ignored || []).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean))
      if (ignored.has(value)) return value
      if (column && column.coding && column.coding.enabled) {
        const map = column.coding.map || {}
        if (map[value] !== undefined && map[value] !== '') return String(map[value])
        const dict = column.dict ? CODING_BY_ID[column.dict] : null
        if (dict) {
          const code = matchDictValue(dict, value)
          if (code != null) return String(code)
        }
      }
      return value
    }

    function effectiveOptions(column) {
      const out = new Map()
      const dict = column && column.dict ? CODING_BY_ID[column.dict] : null
      const ignored = new Set((column?.coding?.ignored || []).map(item => typeof item === 'string' ? item : item?.value).filter(Boolean))
      if (dict) for (const opt of dict.options) { if (!ignored.has(opt.label) && !ignored.has(String(opt.code))) out.set(opt.label, opt.code) }
      const map = (column && column.coding && column.coding.map) || {}
      for (const [key, code] of Object.entries(map)) {
        if (ignored.has(key)) continue
        if (dict && dict.options.some(option => option.code === key && String(code) === key)) continue
        out.set(key, code)
      }
      return [...out.entries()].map(([label, code]) => ({ label, code }))
    }

    function csvCell(value) {
      const text = value == null ? '' : String(value)
      return /[",\r\n]|^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
    }

    function toCsv(rows) {
      return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
    }

    function parseCsv(text) {
      const clean = String(text || '').replace(/^\ufeff/, '')
      const firstBreak = clean.indexOf('\n')
      const firstLine = firstBreak < 0 ? clean : clean.slice(0, firstBreak)
      const tabs = (firstLine.match(/\t/g) || []).length
      const commas = (firstLine.match(/,/g) || []).length
      const delimiter = tabs > commas ? '\t' : ','
      const rows = []
      let row = []
      let cell = ''
      let quoted = false
      for (let i = 0; i < clean.length; i++) {
        const char = clean[i]
        if (quoted) {
          if (char === '"') {
            if (clean[i + 1] === '"') {
              cell += '"'
              i++
            } else quoted = false
          } else cell += char
          continue
        }
        if (char === '"') {
          quoted = true
          continue
        }
        if (char === delimiter) {
          row.push(cell)
          cell = ''
          continue
        }
        if (char === '\r') continue
        if (char === '\n') {
          row.push(cell)
          rows.push(row)
          row = []
          cell = ''
          continue
        }
        cell += char
      }
      if (cell.length || row.length) {
        row.push(cell)
        rows.push(row)
      }
      return rows.filter(entry => entry.some(value => normText(value) !== ''))
    }

    function trimMatrix(matrix) {
      const rows = matrix.map(row => row.map(value => normText(value)))
      const width = rows.reduce((max, row) => {
        let last = -1
        row.forEach((value, index) => {
          if (value !== '') last = index
        })
        return Math.max(max, last + 1)
      }, 0)
      return rows.map(row => {
        const out = row.slice(0, width)
        while (out.length < width) out.push('')
        return out
      })
    }

    /* ================================================================== *
     * XML (tables of the two Office formats)
     * ================================================================== */

    function decodeEntities(text) {
      return text.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, body) => {
        if (body[0] === '#') {
          const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
          return Number.isFinite(code) ? String.fromCodePoint(code) : match
        }
        if (body === 'amp') return '&'
        if (body === 'lt') return '<'
        if (body === 'gt') return '>'
        if (body === 'quot') return '"'
        return "'"
      })
    }

    function findTagEnd(source, start) {
      let quote = ''
      for (let i = start + 1; i < source.length; i++) {
        const char = source[i]
        if (quote) {
          if (char === quote) quote = ''
          continue
        }
        if (char === '"' || char === "'") {
          quote = char
          continue
        }
        if (char === '>') return i
      }
      return -1
    }

    function parseXml(source) {
      const root = { name: '#root', local: '#root', attrs: {}, children: [], text: '' }
      const stack = [root]
      let index = 0
      const length = source.length
      while (index < length) {
        const lt = source.indexOf('<', index)
        if (lt < 0) {
          stack[stack.length - 1].text += decodeEntities(source.slice(index))
          break
        }
        if (lt > index) stack[stack.length - 1].text += decodeEntities(source.slice(index, lt))
        if (source.startsWith('<!--', lt)) {
          const end = source.indexOf('-->', lt)
          index = end < 0 ? length : end + 3
          continue
        }
        if (source.startsWith('<![CDATA[', lt)) {
          const end = source.indexOf(']]>', lt)
          stack[stack.length - 1].text += source.slice(lt + 9, end < 0 ? length : end)
          index = end < 0 ? length : end + 3
          continue
        }
        if (source.startsWith('<?', lt) || source.startsWith('<!', lt)) {
          const end = source.indexOf('>', lt)
          index = end < 0 ? length : end + 1
          continue
        }
        const end = findTagEnd(source, lt)
        if (end < 0) {
          stack[stack.length - 1].text += source.slice(lt)
          break
        }
        const raw = source.slice(lt + 1, end)
        if (raw[0] === '/') {
          if (stack.length > 1) stack.pop()
          index = end + 1
          continue
        }
        const selfClosing = raw.endsWith('/')
        const body = selfClosing ? raw.slice(0, -1) : raw
        const space = body.search(/\s/)
        const name = space < 0 ? body : body.slice(0, space)
        if (!name) {
          index = end + 1
          continue
        }
        const attrs = {}
        if (space >= 0) {
          const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
          let match
          const attrText = body.slice(space)
          while ((match = attrRe.exec(attrText))) attrs[match[1]] = decodeEntities(match[2] !== undefined ? match[2] : match[3])
        }
        const colon = name.indexOf(':')
        const element = { name, local: colon < 0 ? name : name.slice(colon + 1), attrs, children: [], text: '' }
        stack[stack.length - 1].children.push(element)
        if (!selfClosing) stack.push(element)
        index = end + 1
      }
      return root
    }

    function kids(element, local) {
      return element.children.filter(child => child.local === local)
    }

    function firstKid(element, local) {
      return element.children.find(child => child.local === local) || null
    }

    function descendants(element, local, out = []) {
      for (const child of element.children) {
        if (child.local === local) out.push(child)
        descendants(child, local, out)
      }
      return out
    }

    function attr(element, local) {
      if (!element) return ''
      for (const [key, value] of Object.entries(element.attrs)) {
        const colon = key.indexOf(':')
        const tail = colon < 0 ? key : key.slice(colon + 1)
        if (tail === local) return value
      }
      return ''
    }

    function paragraphText(paragraph) {
      let out = ''
      const walk = element => {
        if (element.local === 't') {
          out += element.text
          return
        }
        if (element.local === 'tab') {
          out += '\t'
          return
        }
        if (element.local === 'br') {
          out += '\n'
          return
        }
        for (const child of element.children) walk(child)
      }
      for (const child of paragraph.children) walk(child)
      return out
    }

    /* ================================================================== *
     * container (zip) reader
     * ================================================================== */

    const utf8 = new TextDecoder('utf-8')

    async function openZip(buffer) {
      const bytes = new Uint8Array(buffer)
      const view = new DataView(buffer)
      let eocd = -1
      const floor = Math.max(0, bytes.length - 66000)
      for (let i = bytes.length - 22; i >= floor; i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
          eocd = i
          break
        }
      }
      if (eocd < 0) throw new Error('不是有效的 Office 文件（zip 结构损坏）')
      const count = view.getUint16(eocd + 10, true)
      let offset = view.getUint32(eocd + 16, true)
      const entries = new Map()
      for (let i = 0; i < count; i++) {
        if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
        const method = view.getUint16(offset + 10, true)
        const compressedSize = view.getUint32(offset + 20, true)
        const uncompressedSize = view.getUint32(offset + 24, true)
        const nameLength = view.getUint16(offset + 28, true)
        const extraLength = view.getUint16(offset + 30, true)
        const commentLength = view.getUint16(offset + 32, true)
        const localOffset = view.getUint32(offset + 42, true)
        const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
        entries.set(name, { method, compressedSize, uncompressedSize, localOffset })
        offset += 46 + nameLength + extraLength + commentLength
      }
      async function readBytes(name) {
        const entry = entries.get(name)
        if (!entry) return null
        const local = entry.localOffset
        if (view.getUint32(local, true) !== 0x04034b50) throw new Error('zip 条目损坏：' + name)
        const nameLength = view.getUint16(local + 26, true)
        const extraLength = view.getUint16(local + 28, true)
        const start = local + 30 + nameLength + extraLength
        const payload = bytes.subarray(start, start + entry.compressedSize)
        if (entry.method === 0) return payload
        if (entry.method !== 8) throw new Error('不支持的压缩方式：' + entry.method)
        if (typeof DecompressionStream === 'undefined') throw new Error('当前环境不支持解压 Office 文件')
        const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
        return new Uint8Array(await new Response(stream).arrayBuffer())
      }
      return {
        names: () => [...entries.keys()],
        has: name => entries.has(name),
        readBytes,
        text: async name => {
          const data = await readBytes(name)
          return data ? utf8.decode(data) : null
        }
      }
    }

    /* ================================================================== *
     * Excel
     * ================================================================== */

    function columnIndex(ref) {
      const letters = String(ref || '').match(/^[A-Za-z]+/)
      if (!letters) return -1
      let index = 0
      for (const char of letters[0].toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64)
      return index - 1
    }

    async function parseXlsx(buffer) {
      const zip = await openZip(buffer)
      const sharedXml = await zip.text('xl/sharedStrings.xml')
      const shared = []
      if (sharedXml) {
        const doc = parseXml(sharedXml)
        for (const si of descendants(doc, 'si')) {
          let text = ''
          const walk = element => {
            if (element.local === 't') {
              text += element.text
              return
            }
            for (const child of element.children) walk(child)
          }
          for (const child of si.children) walk(child)
          shared.push(text)
        }
      }
      const workbookXml = await zip.text('xl/workbook.xml')
      if (!workbookXml) throw new Error('Excel 文件缺少 workbook.xml')
      const workbook = parseXml(workbookXml)
      const relsXml = await zip.text('xl/_rels/workbook.xml.rels')
      const rels = relsXml ? parseXml(relsXml) : null
      const relTargets = new Map()
      if (rels) {
        for (const rel of descendants(rels, 'Relationship')) {
          relTargets.set(rel.attrs.Id || rel.attrs.id, rel.attrs.Target || '')
        }
      }
      const sheets = []
      const sheetNodes = descendants(workbook, 'sheet')
      sheetNodes.forEach((sheet, index) => {
        const name = sheet.attrs.name || 'Sheet' + (index + 1)
        const relId = attr(sheet, 'id')
        let target = relTargets.get(relId) || ''
        if (target) {
          target = target.replace(/^\/?xl\//, '').replace(/^\//, '')
          if (!target.startsWith('worksheets/')) target = 'worksheets/' + target.replace(/^.*\//, '')
        } else target = 'worksheets/sheet' + (index + 1) + '.xml'
        if (!zip.has('xl/' + target)) target = target.replace(/^worksheets\//, 'xl/worksheets/')
        sheets.push({ name, path: 'xl/' + target, index })
      })
      if (!sheets.length) {
        for (const name of zip.names()) {
          if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) sheets.push({ name: name.replace(/^.*\/|\.xml$/g, ''), path: name, index: sheets.length })
        }
      }
      if (!sheets.length) throw new Error('Excel 文件里没有工作表')
      const styleXml = await zip.text('xl/styles.xml')
      const zeroWidths = []
      if (styleXml) {
        const styles = parseXml(styleXml)
        const formats = new Map(descendants(styles, 'numFmt').map(node => [attr(node, 'numFmtId'), attr(node, 'formatCode')]))
        const xfs = descendants(styles, 'cellXfs')[0]
        if (xfs) for (const xf of kids(xfs, 'xf')) {
          const format = formats.get(attr(xf, 'numFmtId')) || ''
          zeroWidths.push(/^0+$/.test(format) ? format.length : 0)
        }
      }
      const out = []
      for (const sheet of sheets) {
        const xml = await zip.text(sheet.path)
        if (!xml) continue
        const doc = parseXml(xml)
        const matrix = []
        for (const row of descendants(doc, 'row')) {
          const cells = []
          let autoIndex = 0
          for (const cell of kids(row, 'c')) {
            const ref = cell.attrs.r || ''
            let index = columnIndex(ref)
            if (index < 0) index = autoIndex
            autoIndex = index + 1
            const type = cell.attrs.t || ''
            let value = ''
            if (type === 's') {
              const v = firstKid(cell, 'v')
              const sharedIndex = v ? parseInt(v.text, 10) : -1
              value = shared[sharedIndex] != null ? shared[sharedIndex] : ''
            } else if (type === 'inlineStr') {
              const is = firstKid(cell, 'is')
              if (is) {
                for (const t of descendants(is, 't')) value += t.text
              }
            } else if (type === 'str') {
              const v = firstKid(cell, 'v')
              value = v ? v.text : ''
            } else if (type === 'b') {
              const v = firstKid(cell, 'v')
              value = v && v.text === '1' ? '是' : '否'
            } else {
              const v = firstKid(cell, 'v')
              value = v ? v.text : ''
              if (value && /^-?\d+(\.0+)?$/.test(value)) value = value.replace(/\.0+$/, '')
              const width = zeroWidths[Number(cell.attrs.s || 0)] || 0
              if (width && /^\d+$/.test(value)) value = value.padStart(width, '0')
            }
            cells[index] = value
          }
          const filled = []
          for (let i = 0; i < cells.length; i++) filled[i] = cells[i] == null ? '' : cells[i]
          matrix.push(filled)
        }
        out.push({ name: sheet.name, matrix: trimMatrix(matrix) })
      }
      return out
    }

    /* ================================================================== *
     * Word
     * ================================================================== */

    function tableMatrix(table) {
      const rows = []
      for (const tr of kids(table, 'tr')) {
        const cells = []
        for (const tc of kids(tr, 'tc')) {
          let text = ''
          const paragraphs = kids(tc, 'p')
          paragraphs.forEach((paragraph, index) => {
            const value = paragraphText(paragraph)
            text += (index ? '\n' : '') + value
          })
          if (!paragraphs.length) {
            const nested = kids(tc, 'tbl')
            text = nested.length ? nested.map(tbl => tableMatrix(tbl).map(row => row.join(' ')).join(' / ')).join(' / ') : ''
          }
          let span = 1
          const spanNode = firstKid(tc, 'tcPr') ? firstKid(firstKid(tc, 'tcPr'), 'gridSpan') : null
          if (spanNode) {
            const parsed = parseInt(spanNode.attrs.val || '1', 10)
            if (parsed > 1 && parsed < 40) span = parsed
          }
          for (let i = 0; i < span; i++) cells.push(i ? '' : text)
        }
        rows.push(cells)
      }
      return trimMatrix(rows)
    }

    function insideTable(node, body) {
      let parent = node.parent
      while (parent && parent !== body) {
        if (parent.local === 'tbl') return true
        parent = parent.parent
      }
      return false
    }

    function markParents(element, parent) {
      for (const child of element.children) {
        child.parent = element
        markParents(child, element)
      }
    }

    async function parseDocx(buffer) {
      const zip = await openZip(buffer)
      const xml = await zip.text('word/document.xml')
      if (!xml) throw new Error('Word 文件缺少 document.xml')
      const doc = parseXml(xml)
      markParents(doc, null)
      const root = firstKid(doc, 'document') || doc
      const body = firstKid(root, 'body') || root
      const tables = kids(body, 'tbl').map(tableMatrix).filter(matrix => matrix.length > 0)
      const paragraphs = []
      for (const paragraph of kids(body, 'p')) {
        const text = paragraphText(paragraph).trim()
        if (text) paragraphs.push(text)
      }
      const pairs = {}
      for (const line of paragraphs) {
        const match = /^\s*(?:\d+\s*[.、)．]\s*)?([^：:]{1,24}?)\s*[：:]\s*(.+?)\s*$/.exec(line)
        if (!match) continue
        const key = match[1].replace(/^\s+|\s+$/g, '')
        if (!key || Object.prototype.hasOwnProperty.call(pairs, key)) continue
        pairs[key] = match[2]
      }
      return { tables, paragraphs, pairs: Object.keys(pairs).length >= 2 ? pairs : null }
    }

    /* ================================================================== *
     * table → dataset
     * ================================================================== */

    const ID_LABELS = ['编号', '序号', '问卷编号', '被试编号', 'id', 'no', 'no.']

    function detectHeaderRow(matrix) {
      if (!matrix.length) return 0
      const limit = Math.min(6, matrix.length)
      let best = 0
      let bestScore = -Infinity
      for (let i = 0; i < limit; i++) {
        const row = matrix[i]
        const next = matrix[i + 1] || []
        const filled = row.filter(cell => normText(cell) !== '').length
        if (!filled) continue
        let textish = 0
        let overlap = 0
        row.forEach((cell, index) => {
          const value = normText(cell)
          if (!value) return
          if (value.length <= 24 && !/^-?\d+(\.\d+)?$/.test(value)) textish++
          if (next[index] && normText(next[index]) === value) overlap++
        })
        const nextFilled = next.filter(cell => normText(cell) !== '').length
        let score = textish * 2 + filled + (nextFilled >= Math.max(1, filled - 1) ? 4 : 0) - overlap * 3
        // A merged title row is much emptier than the header under it.
        if (nextFilled > filled + 1) score -= 3
        if (i === 0) score += 5
        if (score > bestScore) {
          bestScore = score
          best = i
        }
      }
      return best
    }

    function keyFor(label, dictId, index, used) {
      let base = dictId || String(label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
      if (!base || base === 'id') base = 'v' + (index + 1)
      let key = base
      let suffix = 2
      while (used.has(key)) key = base + '_' + suffix++
      used.add(key)
      return key
    }

    function buildColumns(headerRow, dataRows, options = {}) {
      const width = Math.max(headerRow.length, ...dataRows.map(row => row.length), 0)
      const used = new Set()
      const columns = []
      for (let index = 0; index < width; index++) {
        if (options.skip && options.skip.includes(index)) continue
        const label = normText(headerRow[index])
        const values = dataRows.map(row => normText(row[index])).filter(value => value !== '')
        if (!label && !values.length) continue
        const name = label || '变量' + (index + 1)
        const entry = matchDictByLabel(name)
        const unique = uniqueOf(values)
        const numeric = values.length > 0 && values.every(value => /^-?\d+(\.\d+)?$/.test(value))
        let dictId = entry ? entry.id : ''
        let kind = 'text'
        if (entry && entry.options.length) kind = 'categorical'
        else if (numeric) kind = 'number'
        else if (unique.length && unique.every(value => /^(是|否|有|无|yes|no|y|n)$/i.test(value))) kind = 'categorical'
        else if (unique.length && unique.length <= 12 && unique.length <= Math.max(2, values.length * 0.6)) kind = 'categorical'
        if (!dictId && kind === 'categorical' && unique.length && unique.every(value => /^(是|否|有|无|yes|no|y|n)$/i.test(value))) dictId = 'yesno'
        const map = {}
        const dict = dictId ? CODING_BY_ID[dictId] : null
        if (dict) {
          for (const opt of dict.options) map[opt.label] = opt.code
          for (const opt of dict.options) map[opt.code] = opt.code
          for (const value of unique) {
            const code = matchDictValue(dict, value)
            if (code != null && map[value] === undefined) map[value] = code
          }
        }
        columns.push({
          key: keyFor(name, dictId, index, used),
          label: name,
          kind,
          dict: dictId,
          coding: { enabled: Boolean(dictId), map, missing: '' },
          source: index
        })
      }
      return columns
    }

    function rowsFromMatrix(dataRows, columns) {
      return dataRows.map((cells, index) => {
        const values = {}
        for (const column of columns) values[column.key] = normText(cells[column.source])
        return { id: String(index + 1), values }
      })
    }

    function datasetFromMatrix(name, matrix, options = {}) {
      const rows = matrix.filter(row => row.some(cell => normText(cell) !== ''))
      if (!rows.length) return { name: name || '人口学数据', columns: [], rows: [] }
      const headerRow = options.headerRow == null ? detectHeaderRow(rows) : options.headerRow
      const header = rows[headerRow] || []
      const candidates = header.map((label, index) => ID_LABELS.some(id => normKey(id) === normKey(label)) ? index : -1).filter(index => index >= 0)
      if (options.idIndex == null && candidates.length > 1) throw new Error('检测到多个编号列，请明确选择编号列')
      const idIndex = options.idIndex == null ? (candidates[0] ?? -1) : Number(options.idIndex)
      if (!Number.isInteger(idIndex) || idIndex < -1 || idIndex >= header.length) throw new Error('编号列位置无效')
      const dataRows = rows.slice(headerRow + 1)
      const columns = buildColumns(header, dataRows, idIndex >= 0 ? { skip: [idIndex] } : {})
      const out = rowsFromMatrix(dataRows, columns)
      if (idIndex >= 0) {
        out.forEach((row, index) => {
          const id = normText(dataRows[index] ? dataRows[index][idIndex] : '')
          if (!id) throw new Error('编号列第 ' + (index + headerRow + 2) + ' 行为空，请补全编号或选择生成编号')
          const width = Number(options.idWidth || 0)
          row.id = width > 0 && /^\d+$/.test(id) ? id.padStart(width, '0') : id
        })
      }
      if (!columns.length && idIndex < 0) {
        // single-column list: treat as one variable
        const fallback = []
        const used = new Set()
        for (const cell of header.filter(value => normText(value) !== '')) {
          fallback.push({ key: keyFor(cell, '', fallback.length, used), label: normText(cell), kind: 'text', dict: '', coding: { enabled: false, map: {}, missing: '' }, source: fallback.length })
        }
        if (fallback.length) {
          return { name: name || '人口学数据', columns: fallback, rows: [] }
        }
      }
      assertIds(out)
      return { name: name || '人口学数据', columns, rows: out, headerRow, idIndex }
    }

    function detectCodebook(matrix) {
      if (!matrix.length) return null
      const header = matrix[0].map(cell => normKey(cell))
      const find = words => header.findIndex(cell => words.some(word => cell && cell.includes(normKey(word))))
      const variableCol = find(['变量', '变量名', '字段', 'variable'])
      const codeCol = find(['编码', '取值', '值', 'code', 'value'])
      const labelCol = find(['标签', '含义', '说明', 'label', 'meaning'])
      if (variableCol < 0 || codeCol < 0 || labelCol < 0) return null
      const entries = []
      for (const row of matrix.slice(1)) {
        const variable = normText(row[variableCol])
        const code = normText(row[codeCol])
        const label = normText(row[labelCol])
        if (!variable || !code || !label) continue
        entries.push({ variable, code, label })
      }
      return entries.length ? entries : null
    }

    function applyCodebook(columns, entries) {
      let applied = 0
      for (const column of columns) {
        const relevant = entries.filter(entry => normKey(entry.variable) === normKey(column.label) || normKey(column.label).includes(normKey(entry.variable)))
        if (!relevant.length) continue
        column.coding = column.coding || { enabled: true, map: {}, missing: '' }
        column.coding.enabled = true
        for (const entry of relevant) {
          column.coding.map[entry.label] = entry.code
          column.coding.map[entry.code] = entry.code
        }
        applied++
      }
      return applied
    }

    function assertIds(rows) {
      const ids = new Set()
      for (const row of rows) {
        if (typeof row.id !== 'string' || !row.id.trim()) throw new Error('编号必须是非空字符串')
        if (ids.has(row.id)) throw new Error('重复被试编号：' + row.id)
        ids.add(row.id)
      }
    }

    function nextParticipantId(rows) {
      const numeric = rows.map(row => row.id).filter(id => /^\d+$/.test(id))
      const width = numeric.reduce((max, id) => Math.max(max, id.startsWith('0') ? id.length : 0), 0)
      let next = numeric.reduce((max, id) => BigInt(id) > max ? BigInt(id) : max, 0n) + 1n
      const ids = new Set(rows.map(row => row.id))
      while (ids.has(String(next).padStart(width, '0'))) next++
      return String(next).padStart(width, '0')
    }

    function mergeDatasets(current, incoming) {
      assertIds(current.rows)
      assertIds(incoming.rows)
      const columns = current.columns.map(column => ({ ...column, coding: { ...column.coding, map: { ...column.coding.map } } }))
      const mapping = new Map(columns.map(column => [normKey(column.label), column.key]))
      const used = new Set(columns.map(column => column.key))
      for (const column of incoming.columns) {
        const signature = normKey(column.label)
        if (mapping.has(signature)) {
          const existing = columns.find(item => item.key === mapping.get(signature))
          const settings = item => JSON.stringify([item.kind, item.dict || '', Boolean(item.coding?.enabled), item.coding?.missing || '', Object.entries(item.coding?.map || {}).sort(([a], [b]) => a.localeCompare(b))])
          if (settings(existing) !== settings(column)) throw new Error('变量编码冲突：' + column.label + '。类型、词典或映射不同，请先统一后追加')
          continue
        }
        const copy = { ...column, coding: { ...column.coding, map: { ...column.coding.map } } }
        copy.key = keyFor(copy.label, copy.dict, columns.length, used)
        columns.push(copy)
        mapping.set(signature, copy.key)
      }
      const rows = current.rows.map(row => ({ id: row.id, values: { ...row.values } }))
      for (const row of incoming.rows) {
        const values = {}
        for (const column of incoming.columns) {
          const target = mapping.get(normKey(column.label))
          if (target) values[target] = normText(row.values[column.key])
        }
        const existing = rows.find(item => item.id === row.id)
        if (existing) {
          const identical = columns.every(column => normText(existing.values[column.key]) === normText(values[column.key]))
          throw new Error('编号冲突：' + row.id + '（' + (identical ? '内容相同' : '内容不同') + '）。本批未追加，请先核对并移除重复记录或更正原始编号')
        }
        rows.push({ id: row.id, values })
      }
      return { name: current.name, columns, rows }
    }

    function datasetCsv(dataset, options = {}) {
      const coded = options.coded !== false
      const header = ['被试编号', ...dataset.columns.map(column => column.label)]
      const rows = [header]
      dataset.rows.forEach((row, index) => {
        rows.push([
          normText(row.id) || String(index + 1),
          ...dataset.columns.map(column => {
            const raw = row.values[column.key]
            return coded ? codeOf(column, raw) : normText(raw)
          })
        ])
      })
      return toCsv(rows)
    }

    function codebookCsv(dataset) {
      const rows = [['变量名', '标签', '类型', '编码', '缺失值']]
      for (const column of dataset.columns) {
        const pairs = effectiveOptions(column).map(option => option.label + '=' + option.code)
        rows.push([
          column.key,
          column.label,
          column.kind === 'number' ? '数值' : column.kind === 'categorical' ? '分类' : '文本',
          pairs.join('; '),
          (column.coding && column.coding.missing) || ''
        ])
      }
      return toCsv(rows)
    }

    function datasetJson(dataset, study = null) {
      return JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), ...(study ? { study } : {}), dataset: cloneDataset(dataset) }, null, 2)
    }

    function parseSnapshot(text) {
      const parsed = JSON.parse(String(text).replace(/^\ufeff/, ''))
      if (parsed.schemaVersion !== 2 || !parsed.dataset) throw new Error('需要 schemaVersion=2 的完整人口学快照；旧扁平镜像由 Host 兼容读取')
      const dataset = cloneDataset(parsed.dataset)
      if (!Array.isArray(dataset.columns) || !Array.isArray(dataset.rows)) throw new Error('快照缺少变量或记录')
      const keys = new Set()
      for (const column of dataset.columns) {
        if (!column || typeof column.key !== 'string' || !column.key || column.key === 'id' || keys.has(column.key)) throw new Error('快照变量 key 无效或重复')
        keys.add(column.key)
        if (!column.coding || typeof column.coding.map !== 'object' || !column.coding.map || Array.isArray(column.coding.map)) throw new Error('快照缺少完整编码配置')
      }
      assertIds(dataset.rows)
      for (const row of dataset.rows) if (!row.values || typeof row.values !== 'object' || Array.isArray(row.values) || Object.prototype.hasOwnProperty.call(row.values, 'id')) throw new Error('快照原始 values 无效')
      return dataset
    }

    function fileStem() {
      const now = new Date()
      const pad = value => String(value).padStart(2, '0')
      return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes())
    }

    function cloneDataset(dataset) {
      return JSON.parse(JSON.stringify(dataset))
    }

    function emptyDataset(name) {
      return { name: name || '人口学数据', columns: [], rows: [] }
    }

    function templateDataset(templateId) {
      const template = TEMPLATES.find(item => item.id === templateId) || TEMPLATES[0]
      const used = new Set()
      const columns = template.vars.map((id, index) => {
        const dict = CODING_BY_ID[id]
        const map = {}
        for (const option of dict.options) map[option.label] = option.code
        for (const option of dict.options) map[option.code] = option.code
        return {
          key: keyFor(dict.label, dict.id, index, used),
          label: dict.label,
          kind: dict.kind || (dict.options.length ? 'categorical' : 'number'),
          dict: dict.id,
          coding: { enabled: true, map, missing: '' },
          source: index
        }
      })
      return { name: template.id === 'blank' ? '人口学数据' : template.label + '数据', columns, rows: [] }
    }

    function columnFromLabel(label, existing) {
      const dict = matchDictByLabel(label)
      const used = new Set(existing.map(column => column.key))
      const map = {}
      if (dict) {
        for (const option of dict.options) map[option.label] = option.code
        for (const option of dict.options) map[option.code] = option.code
      }
      return {
        key: keyFor(label, dict ? dict.id : '', existing.length, used),
        label: normText(label),
        kind: dict ? (dict.kind || (dict.options.length ? 'categorical' : 'number')) : 'text',
        dict: dict ? dict.id : '',
        coding: { enabled: Boolean(dict), map, missing: '' },
        source: existing.reduce((max, column) => Math.max(max, Number(column.source) || 0), -1) + 1
      }
    }

    /* ================================================================== *
     * local storage
     * ================================================================== */

    // 草稿键含实例与数据集：同 studyId 的两个本地实例/两份数据集不能交叉恢复。
    function draftKey(studyId, instanceId, dataset) {
      return 'dc:dataset:v3:' + identityApi.safeSegment(instanceId || 'none') + ':' + identityApi.safeSegment(studyId || 'none') + ':' + identityApi.safeSegment(dataset || 'none')
    }

    function loadDataset(studyId, instanceId, dataset) {
      try {
        if (!studyId) return null
        const raw = localStorage.getItem(draftKey(studyId, instanceId, dataset))
        if (!raw) return null
        const envelope = JSON.parse(raw)
        if (envelope.studyId !== studyId) return null
        return { ...envelope, dataset: parseSnapshot(datasetJson(envelope.dataset)) }

      } catch {
        return null
      }
    }

    /* 页面身份：共享逻辑在 research-core/client-identity.mjs。 */
    const identityApi = window.__DSH_RESEARCH_CLIENT_IDENTITY__
    if (!identityApi) throw new Error('页面身份模块未加载，请刷新页面')
    let hostCtx = null
    const identity = identityApi.createClientIdentity({
      plugin: 'demographic-coder',
      storage: (() => { try { return sessionStorage } catch { return null } })(),
      global: (typeof window !== 'undefined' ? window : globalThis),
      workspaceProvider: ctx => identityApi.workspaceFromContext(ctx),
    })
    function newPage() { identity.newPage(); activeBinding = null; return identity.pageId() }
    let activeBinding = null
    const sourceLabel = { page: '页面连接', session: '会话连接', workspace: '工作区记录', project: '工作区项目配置', legacy: '旧配置来源', candidate: '候选研究', empty: '空研究', explicit: '已连接' }

    async function requestTicket() {
      await identity.ready()
      const snapshot = identity.prepare(hostCtx)
      return { snapshot, headers: identity.headers(), body: identity.body() }
    }

    async function hostCall(action, payload) {
      const ticket = await requestTicket()
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demographic-coder': '1', ...ticket.headers },
        body: JSON.stringify({ action, payload: { ...(payload || {}), ...ticket.body } })
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body || !body.ok) {
        const message = body && body.error && body.error.message ? body.error.message : 'HTTP ' + response.status
        const error = new Error(message)
        error.code = body?.error?.code
        throw error
      }
      identity.accept(ticket.snapshot, body.data && body.data.binding, { allowRebind: action === 'studyConnect' || action === 'studySave' })
      if (body.data && body.data.binding && body.data.binding.token) activeBinding = body.data.binding.token
      return body.data
    }

    async function hostStatus() {
      const ticket = await requestTicket()
      const response = await fetch(API + '?action=status&pageId=' + encodeURIComponent(ticket.body.pageId), { headers: { 'x-demographic-coder': '1', ...ticket.headers } })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body || !body.ok) throw new Error('人口学录入的本地接口不可用')
      identity.accept(ticket.snapshot, body.data && body.data.binding)
      if (body.data && body.data.binding && body.data.binding.token) activeBinding = body.data.binding.token
      return body.data
    }

    function downloadCsv(filename, text) {
      const utf8Bom = '\ufeff'
      const blob = new Blob([String(text).startsWith(utf8Bom) ? text : utf8Bom + text], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.rel = 'noopener'
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    }

    async function readFileMatrix(file) {
      const name = String(file.name || '')
      const lower = name.toLowerCase()
      if (lower.endsWith('.json')) {
        const text = await file.text()
        const document = JSON.parse(text.replace(/^\ufeff/, ''))
        return { kind: 'snapshot', name, dataset: parseSnapshot(text), study: document.study || (document.studyId ? { id: document.studyId } : null), sheets: [] }
      }
      if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
        const sheets = await parseXlsx(await file.arrayBuffer())
        return { kind: 'xlsx', name, sheets, pairs: null }
      }
      if (lower.endsWith('.docx')) {
        const parsed = await parseDocx(await file.arrayBuffer())
        return {
          kind: 'docx',
          name,
          sheets: parsed.tables.map((matrix, index) => ({ name: '表格 ' + (index + 1), matrix })),
          pairs: parsed.pairs,
          paragraphs: parsed.paragraphs
        }
      }
      if (lower.endsWith('.csv') || lower.endsWith('.txt') || file.type === 'text/csv' || file.type === 'text/plain') {
        const text = await file.text()
        return { kind: 'csv', name, sheets: [{ name: 'CSV', matrix: trimMatrix(parseCsv(text)) }], pairs: null }
      }
      if (lower.endsWith('.doc') || lower.endsWith('.xls')) {
        throw new Error('旧版 .doc / .xls 无法读取，请在 Office 里另存为 .docx / .xlsx 再导入')
      }
      throw new Error('支持 .xlsx、.docx 与 .csv 文件')
    }

    /* ================================================================== *
     * components
     * ================================================================== */

    function stem(name) {
      return String(name || '')
        .replace(/^.*[\\/]/, '')
        .replace(/\.[^.]+$/, '')
        .slice(0, 60) || '人口学数据'
    }

    function useT() {
      return React.useContext(TContext)
    }

    function Btn({ children, variant = 'default', size = 'md', className = '', ...rest }) {
      return h(
        'button',
        { type: 'button', className: ('dc-btn dc-btn-' + variant + ' dc-btn-' + size + ' ' + className).trim(), ...rest },
        children
      )
    }

    function Chip({ children, tone = 'plain', title }) {
      return h('span', { className: 'dc-chip dc-chip-' + tone, title }, children)
    }

    function Empty({ title, text, children }) {
      return h(
        'div',
        { className: 'dc-empty' },
        h('div', { className: 'dc-empty-mark', 'aria-hidden': true }, '＋'),
        h('strong', null, title),
        text ? h('p', null, text) : null,
        children ? h('div', { className: 'dc-empty-actions' }, children) : null
      )
    }

    function Icon({ size = 18, active = false }) {
      return h(
        'svg',
        { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': true, style: { display: 'block', opacity: active ? 1 : 0.82 } },
        h('rect', { width: 64, height: 64, rx: 15, fill: '#3f5efb' }),
        h('rect', { x: 15, y: 12, width: 30, height: 38, rx: 4, fill: '#ffffff' }),
        h('rect', { x: 20, y: 19, width: 20, height: 4, rx: 2, fill: '#3f5efb' }),
        h('rect', { x: 20, y: 27, width: 13, height: 4, rx: 2, fill: '#3f5efb', opacity: 0.55 }),
        h('rect', { x: 20, y: 35, width: 16, height: 4, rx: 2, fill: '#3f5efb', opacity: 0.55 }),
        h('circle', { cx: 44, cy: 44, r: 11, fill: '#12b886', stroke: '#3f5efb', strokeWidth: 2 }),
        h('path', { d: 'M39.2 44.4l3.2 3.2 6.1-6.5', fill: 'none', stroke: '#ffffff', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' })
      )
    }

    function ValueInput({ column, value, onChange, onKeyDown, inputRef, listSuffix = '' }) {
      const options = effectiveOptions(column)
      const listId = 'dc-dl-' + column.key + (listSuffix || '')
      return h(
        'div',
        { className: 'dc-value' },
        h('input', {
          ref: inputRef,
          className: 'dc-input',
          value: value || '',
          list: options.length ? listId : undefined,
          inputMode: column.kind === 'number' ? 'decimal' : 'text',
          spellCheck: false,
          autoComplete: 'off',
          placeholder: options.length
            ? options.slice(0, 3).map(option => option.label).join(' / ')
            : column.kind === 'number' ? '0' : '—',
          onChange: event => onChange(event.target.value),
          onKeyDown
        }),
        options.length
          ? h('datalist', { id: listId }, options.map(option => h('option', { key: option.label, value: option.label })))
          : null
      )
    }

    function valueProblem(column, value) {
      const raw = normText(value)
      if (!raw) return column.required ? '此项必填' : ''
      if (column.kind !== 'number') return ''
      if (!Number.isFinite(Number(raw))) return '需要有效数值；原文保留供修改'
      if (Number.isFinite(column.min) && Number(raw) < column.min) return '低于下限 ' + column.min
      if (Number.isFinite(column.max) && Number(raw) > column.max) return '高于上限 ' + column.max
      return ''
    }

    function codeState(column, value) {
      const raw = normText(value)
      if (!raw) return { code: '', known: false }
      const options = effectiveOptions(column)
      const known = options.some(
        option => normKey(option.label) === normKey(raw) || normKey(option.code) === normKey(raw)
      )
      return { code: codeOf(column, raw), known }
    }

    /* ---------------------------------------------------------------- entry */

    function EntryField({ column, value, onChange, onKeyDown, inputRef }) {
      const t = useT()
      const options = effectiveOptions(column)
      const state = codeState(column, value)
      const legend = options.slice(0, 4).map(option => option.label + '=' + option.code).join(' · ')
      const showCode = Boolean(normText(value)) && state.known && state.code !== normText(value)
      const unmapped = Boolean(normText(value)) && Boolean(options.length) && !state.known
      const problem = valueProblem(column, value)
      const suggestions = suggestDictValue(CODING_BY_ID[column.dict], value)
      return h(
        'div',
        { className: 'dc-field' },
        h(
          'div',
          { className: 'dc-field-head' },
          h('span', { className: 'dc-field-label' }, column.label),
          h('span', { className: 'dc-field-key' }, column.key)
        ),
        h(ValueInput, { column, value, onChange, onKeyDown, inputRef }),
        h(
          'div',
          { className: 'dc-field-foot' },
          problem ? h('span', { className: 'dc-code dc-code-warn', role: 'alert' }, problem) : null,
          suggestions.length ? h('span', { className: 'dc-legend' }, '候选（未应用）：' + suggestions.map(option => option.label).join(' / ')) : null,
          showCode ? h('span', { className: 'dc-code' }, '→ ' + state.code) : null,
          unmapped ? h('span', { className: 'dc-code dc-code-warn' }, t('该值不会编码')) : null,
          options.length && !showCode && !unmapped ? h('span', { className: 'dc-legend' }, legend) : null
        )
      )
    }

    function EntryTab({ dataset, addRow, removeLast, flash, go }) {
      const t = useT()
      const columns = dataset.columns
      const [draft, setDraft] = useState({})
      const [duplicate, setDuplicate] = useState(-1)
      const firstRef = useRef(null)
      const nextId = useMemo(() => nextParticipantId(dataset.rows), [dataset.rows])
      const [draftId, setDraftId] = useState(nextId)

      useEffect(() => setDraftId(nextId), [nextId])
      useEffect(() => {
        const node = firstRef.current
        if (node) node.focus()
      }, [columns.length])

      const focusFirst = () => {
        const node = firstRef.current
        if (node) {
          node.focus()
          if (typeof node.select === 'function') node.select()
        }
      }

      const update = (key, value) => {
        setDraft(prev => ({ ...prev, [key]: value }))
        if (duplicate >= 0) setDuplicate(-1)
      }

      const commit = () => {
        if (!columns.length) return
        const values = {}
        let filled = 0
        for (const column of columns) {
          const canonical = canonicalValue(column, draft[column.key])
          values[column.key] = canonical
          if (canonical) filled++
        }
        const invalid = columns.find(column => valueProblem(column, values[column.key]))
        if (invalid) { flash('bad', invalid.label + '：' + valueProblem(invalid, values[invalid.key])); return }
        if (!filled) {
          flash('warn', t('至少填写一项'))
          focusFirst()
          return
        }
        const same = dataset.rows.findIndex(row => columns.every(column => normText(row.values[column.key]) === values[column.key]))
        if (same >= 0 && duplicate !== same) {
          setDuplicate(same)
          flash('warn', t('与第N份相同', { n: same + 1 }) + '，' + t('再按一次确认'))
          return
        }
        const id = normText(draftId) || nextId
        if (dataset.rows.some(row => row.id === id)) { flash('bad', '编号冲突：' + id + '，请核对；当前表单保留'); return }
        addRow({ id, values })
        setDraft({})
        setDuplicate(-1)
        flash('ok', t('已录入', { n: dataset.rows.length + 1 }))
        setTimeout(focusFirst, 0)
      }

      if (!columns.length) {
        return h(
          Empty,
          { title: t('尚无变量'), text: t('导入问卷或选择模板后即可录入') },
          h(Btn, { variant: 'primary', onClick: () => go('import') }, t('导入与新建'))
        )
      }

      const recent = dataset.rows.slice(-3).reverse()

      return h(
        'div',
        { className: 'dc-entry' },
        h(
          'div',
          { className: 'dc-entry-head' },
          h(
            'div',
            null,
            h('h2', null, t('第N份问卷', { n: dataset.rows.length + 1 })),
            h('p', null, t('按Tab逐项填写'))
          ),
          h(
            'label',
            { className: 'dc-idbox' },
            h('span', null, t('被试编号')),
            h('input', {
              className: 'dc-input dc-input-id',
              value: draftId,
              onChange: event => setDraftId(event.target.value),
              onKeyDown: event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                }
              }
            })
          )
        ),
        h(
          'form',
          {
            className: 'dc-form',
            onSubmit: event => {
              event.preventDefault()
              commit()
            }
          },
          h(
            'div',
            { className: 'dc-fields' },
            columns.map((column, index) =>
              h(EntryField, {
                key: column.key,
                column,
                value: draft[column.key] || '',
                onChange: value => update(column.key, value),
                inputRef: index === 0 ? firstRef : undefined
              })
            )
          ),
          h(
            'div',
            { className: 'dc-entry-foot' },
            h(
              'div',
              { className: 'dc-preview' },
              h('span', { className: 'dc-preview-label' }, t('编码预览')),
              h(
                'span',
                { className: 'dc-preview-body' },
                columns
                  .map(column => {
                    const raw = normText(draft[column.key])
                    if (!raw) return null
                    const state = codeState(column, raw)
                    return column.key + '=' + (state.code || raw)
                  })
                  .filter(Boolean)
                  .join('  ') || '—'
              )
            ),
            h(
              'div',
              { className: 'dc-entry-actions' },
              h(
                Btn,
                {
                  variant: 'ghost',
                  onClick: () => {
                    setDraft({})
                    setDuplicate(-1)
                    focusFirst()
                  },
                  title: t('清空当前表单')
                },
                t('清空')
              ),
              h(Btn, { variant: 'primary', type: 'submit' }, t('保存并继续') + ' ⏎')
            )
          )
        ),
        recent.length
          ? h(
              'div',
              { className: 'dc-recent' },
              h(
                'div',
                { className: 'dc-recent-head' },
                h('span', null, t('最近录入')),
                h(Btn, { variant: 'ghost', size: 'sm', onClick: removeLast }, t('撤销上一份'))
              ),
              h(
                'ul',
                null,
                recent.map(row =>
                  h(
                    'li',
                    { key: row.id },
                    h('span', { className: 'dc-recent-id' }, row.id),
                    h(
                      'span',
                      { className: 'dc-recent-body' },
                      columns
                        .slice(0, 5)
                        .map(column => normText(row.values[column.key]))
                        .filter(Boolean)
                        .join(' · ') || '—'
                    ),
                    h('span', { className: 'dc-recent-code' }, columns
                      .slice(0, 4)
                      .map(column => codeOf(column, row.values[column.key]))
                      .filter(Boolean)
                      .join(' / '))
                  )
                )
              )
            )
          : null
      )
    }

    /* ----------------------------------------------------------------- data */

    function DataTab({ dataset, setDataset, flash, go }) {
      const t = useT()
      const columns = dataset.columns
      const [query, setQuery] = useState('')
      const [showCodes, setShowCodes] = useState(false)
      const [limit, setLimit] = useState(200)
      const [confirmClear, setConfirmClear] = useState(false)

      const filtered = useMemo(() => {
        const needle = normText(query).toLowerCase()
        const indexed = dataset.rows.map((row, index) => ({ row, index }))
        if (!needle) return indexed
        return indexed.filter(({ row }) =>
          String(row.id).includes(needle) ||
          columns.some(column => String(row.values[column.key] || '').toLowerCase().includes(needle))
        )
      }, [dataset.rows, columns, query])

      const setCell = (index, key, value) => {
        setDataset(prev => {
          const rows = prev.rows.slice()
          const target = rows[index]
          if (!target) return prev
          rows[index] = { ...target, values: { ...target.values, [key]: value } }
          return { ...prev, rows }
        })
      }

      const removeRow = index => {
        setDataset(prev => ({ ...prev, rows: prev.rows.filter((_, at) => at !== index) }))
      }

      const addBlank = () => {
        setDataset(prev => {
          return { ...prev, rows: [...prev.rows, { id: nextParticipantId(prev.rows), values: {} }] }
        })
      }

      if (!columns.length) {
        return h(
          Empty,
          { title: t('没有数据'), text: t('导入问卷或选择模板后即可录入') },
          h(Btn, { variant: 'primary', onClick: () => go('import') }, t('导入与新建'))
        )
      }

      return h(
        'div',
        { className: 'dc-data' },
        h(
          'div',
          { className: 'dc-toolbar' },
          h('input', {
            className: 'dc-input dc-search',
            value: query,
            placeholder: t('搜索'),
            onChange: event => setQuery(event.target.value)
          }),
          h('span', { className: 'dc-toolbar-count' }, filtered.length + ' / ' + dataset.rows.length),
          h('span', { className: 'dc-spacer' }),
          h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setShowCodes(value => !value) }, showCodes ? t('显示原始值') : t('显示编码值')),
          h(Btn, { variant: 'secondary', size: 'sm', onClick: addBlank }, t('添加一行')),
          confirmClear
            ? h(
                'span',
                { className: 'dc-confirm' },
                h('span', null, t('将删除N份', { n: dataset.rows.length })),
                h(
                  Btn,
                  {
                    variant: 'danger',
                    size: 'sm',
                    onClick: () => {
                      setDataset(prev => ({ ...prev, rows: [] }))
                      setConfirmClear(false)
                      flash('ok', t('清空'))
                    }
                  },
                  t('确认删除')
                ),
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setConfirmClear(false) }, t('取消'))
              )
            : h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setConfirmClear(true) }, t('清空全部数据'))
        ),
        h(
          'div',
          { className: 'dc-table-wrap' },
          h(
            'table',
            { className: 'dc-table' },
            h(
              'thead',
              null,
              h(
                'tr',
                null,
                h('th', { className: 'dc-th-id' }, t('被试编号')),
                columns.map(column =>
                  h(
                    'th',
                    { key: column.key, title: column.label + ' · ' + column.key },
                    h('span', { className: 'dc-th-label' }, column.label),
                    h('span', { className: 'dc-th-key' }, column.key)
                  )
                )
              )
            ),
            h(
              'tbody',
              null,
              filtered.slice(0, limit).map(({ row, index }) =>
                h(
                  'tr',
                  { key: index },
                  h(
                    'td',
                    { className: 'dc-td-id' },
                    h('input', {
                      className: 'dc-cell-input dc-cell-id',
                      value: row.id,
                      onChange: event => setDataset(prev => {
                        const rows = prev.rows.slice()
                        rows[index] = { ...rows[index], id: event.target.value }
                        return { ...prev, rows }
                      })
                    }),
                    h('button', {
                      type: 'button',
                      className: 'dc-row-del',
                      title: t('删除此行'),
                      'aria-label': t('删除此行'),
                      onClick: () => removeRow(index)
                    }, '×')
                  ),
                  columns.map(column =>
                    h(
                      'td',
                      { key: column.key },
                      showCodes
                        ? h('span', { className: 'dc-cell-code' }, codeOf(column, row.values[column.key]) || '·')
                        : h('input', {
                            className: 'dc-cell-input',
                            value: row.values[column.key] || '',
                            'aria-invalid': Boolean(valueProblem(column, row.values[column.key])),
                            title: valueProblem(column, row.values[column.key]) || column.label,
                            onChange: event => setCell(index, column.key, event.target.value)
                          })
                    )
                  )
                )
              )
            )
          ),
          !filtered.length ? h('div', { className: 'dc-table-empty' }, t('没有数据')) : null,
          filtered.length > limit
            ? h(
                'div',
                { className: 'dc-table-more' },
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setLimit(filtered.length) }, '显示全部 ' + filtered.length + ' 行')
              )
            : null
        )
      )
    }

    /* --------------------------------------------------------------- coding */

    function DimensionAdder({ onAdd }) {
      const [value, setValue] = useState('')
      const [code, setCode] = useState('')
      return h('form', {
        className: 'dc-dimadd',
        onSubmit: event => {
          event.preventDefault()
          if (!normText(value)) return
          if (onAdd(value, code)) { setValue(''); setCode('') }
        }
      },
        h('input', { className: 'dc-input dc-dimadd-value', value, placeholder: '新增取值', 'aria-label': '新增取值', onChange: event => setValue(event.target.value) }),
        h('input', { className: 'dc-input dc-dimadd-code', value, placeholder: '编码', 'aria-label': '新增取值的编码', onChange: event => setCode(event.target.value) }),
        h('button', { type: 'submit', className: 'dc-btn dc-btn-secondary dc-btn-sm' }, '添加取值'))
    }

    function CodingTab({ dataset, setDataset, flash }) {
      const t = useT()
      const columns = dataset.columns
      const [newLabel, setNewLabel] = useState('')
      const [newKind, setNewKind] = useState('categorical')
      const [confirmDel, setConfirmDel] = useState('')

      const uniqueMap = useMemo(() => {
        const out = {}
        for (const column of columns) out[column.key] = uniqueOf(dataset.rows.map(row => row.values[column.key]))
        return out
      }, [dataset.rows, columns])

      const patchColumn = (key, patch) => {
        setDataset(prev => ({ ...prev, columns: prev.columns.map(column => (column.key === key ? { ...column, ...patch } : column)) }))
      }

      const setMapping = (column, value, code) => {
        setDataset(prev => ({
          ...prev,
          columns: prev.columns.map(item => {
            if (item.key !== column.key) return item
            const map = { ...item.coding.map }
            if (code === '') delete map[value]
            else map[value] = code
            return { ...item, coding: { ...item.coding, enabled: true, map } }
          })
        }))
      }

      const ignoredEntries = column => (column.coding.ignored || [])
        .map(item => typeof item === 'string' ? { value: item, code: '' } : item)
        .filter(item => item && item.value)

      const syncMap = column => {
        const dict = (column.dict && CODING_BY_ID[column.dict]) || matchDictByLabel(column.label)
        const ignored = new Set(ignoredEntries(column).map(item => item.value))
        const map = { ...column.coding.map }
        for (const value of uniqueOf(dataset.rows.map(row => row.values[column.key]))) {
          if (ignored.has(value) || map[value] !== undefined) continue
          const auto = dict ? matchDictValue(dict, value) : null
          map[value] = auto != null ? String(auto) : value
        }
        return { map, dictId: dict ? dict.id : column.dict }
      }

      const toggleCoding = (column, enabled) => {
        if (!enabled) {
          patchColumn(column.key, { coding: { ...column.coding, enabled: false } })
          return
        }
        const { map, dictId } = syncMap(column)
        patchColumn(column.key, { dict: dictId || column.dict, coding: { ...column.coding, enabled: true, map } })
      }

      const syncColumn = column => {
        const { map, dictId } = syncMap(column)
        patchColumn(column.key, { dict: dictId || column.dict, coding: { ...column.coding, enabled: true, map } })
        flash('ok', '已同步已填取值')
      }

      const addDimension = (column, value, code) => {
        const text = normText(value)
        if (!text) return false
        const existing = new Set([
          ...uniqueOf(dataset.rows.map(row => row.values[column.key])),
          ...Object.keys(column.coding.map || {}),
          ...effectiveOptions(column).map(option => option.label)
        ])
        if (existing.has(text)) {
          flash('warn', '该取值已存在')
          return false
        }
        const map = { ...column.coding.map, [text]: normText(code) }
        const ignored = ignoredEntries(column).filter(item => item.value !== text)
        patchColumn(column.key, { coding: { ...column.coding, enabled: true, map, ignored } })
        flash('ok', '已添加取值 ' + text)
        return true
      }

      const removeDimension = (column, value) => {
        const map = { ...column.coding.map }
        const code = map[value] === undefined ? '' : String(map[value])
        delete map[value]
        const ignored = [...ignoredEntries(column).filter(item => item.value !== value), { value, code }]
        patchColumn(column.key, { coding: { ...column.coding, map, ignored } })
      }

      const restoreDimension = (column, value) => {
        const entries = ignoredEntries(column)
        const entry = entries.find(item => item.value === value)
        const ignored = entries.filter(item => item.value !== value)
        const map = { ...column.coding.map }
        if (map[value] === undefined) map[value] = entry?.code || value
        patchColumn(column.key, { coding: { ...column.coding, enabled: true, map, ignored } })
      }

      const runAutoCode = column => {
        const dict = (column.dict && CODING_BY_ID[column.dict]) || matchDictByLabel(column.label)
        if (!dict) {
          flash('warn', '没有匹配的编码词典，请手动填写编码')
          return
        }
        setDataset(prev => ({
          ...prev,
          columns: prev.columns.map(item => {
            if (item.key !== column.key) return item
            const map = { ...item.coding.map }
            for (const option of dict.options) {
              map[option.label] = option.code
              map[option.code] = option.code
            }
            for (const value of uniqueOf(dataset.rows.map(row => row.values[item.key]))) {
              const code = matchDictValue(dict, value)
              if (code != null) map[value] = code
            }
            return { ...item, dict: dict.id, coding: { ...item.coding, enabled: true, map } }
          })
        }))
        flash('ok', t('自动编码') + ' · ' + dict.label)
      }

      const addVariable = () => {
        const label = normText(newLabel)
        if (!label) return
        if (columns.some(column => normKey(column.label) === normKey(label))) {
          flash('warn', t('变量已存在'))
          return
        }
        const column = columnFromLabel(label, columns)
        if (newKind !== 'blank') column.kind = newKind
        setDataset(prev => ({ ...prev, columns: [...prev.columns, column] }))
        setNewLabel('')
        flash('ok', t('添加变量') + ' · ' + label)
      }

      const removeColumn = key => {
        setDataset(prev => ({ ...prev, columns: prev.columns.filter(column => column.key !== key) }))
        setConfirmDel('')
      }

      return h(
        'div',
        { className: 'dc-coding' },
        h(
          'div',
          { className: 'dc-section-head' },
          h('div', null,
            h('h2', null, t('变量与编码')),
            h('p', null, '分类变量按「原始值 = 编码」导出；词典只自动使用精确匹配，模糊候选需手动确认。')
          )
        ),
        h(
          'div',
          { className: 'dc-cards' },
          columns.map(column => {
            const options = effectiveOptions(column)
            const observed = uniqueMap[column.key] || []
            const dict = column.dict ? CODING_BY_ID[column.dict] : null
            const ignored = ignoredEntries(column)
            const ignoredSet = new Set(ignored.map(item => item.value))
            const shownAll = [...new Set([...observed, ...options.map(option => option.label)])].filter(value => !ignoredSet.has(value))
            const shown = shownAll.slice(0, 40)
            return h(
              'section',
              { key: column.key, className: 'dc-card' },
              h(
                'header',
                { className: 'dc-card-head' },
                h('div', { className: 'dc-card-title' },
                  h('strong', null, column.label),
                  h('code', null, column.key)
                ),
                h(Chip, { tone: column.kind === 'categorical' ? 'brand' : column.kind === 'number' ? 'muted' : 'plain' },
                  column.kind === 'categorical' ? t('分类') : column.kind === 'number' ? t('数值') : t('文本')),
                h('span', { className: 'dc-card-count' }, shownAll.length + ' ' + t('所有值'))
              ),
              h(
                'div',
                { className: 'dc-card-tools' },
                h(
                  'select',
                  {
                    className: 'dc-select',
                    value: column.kind,
                    onChange: event => patchColumn(column.key, { kind: event.target.value })
                  },
                  h('option', { value: 'categorical' }, t('分类')),
                  h('option', { value: 'number' }, t('数值')),
                  h('option', { value: 'text' }, t('文本'))
                ),
                h('label', { className: 'dc-switch' },
                  h('input', {
                    type: 'checkbox',
                    checked: Boolean(column.coding.enabled),
                    onChange: event => toggleCoding(column, event.target.checked)
                  }),
                  h('span', null, '编码')
                ),
                h('label', { className: 'dc-inline' }, '缺失导出值', h('input', { className: 'dc-map-input', value: column.coding.missing ?? '', onChange: event => patchColumn(column.key, { coding: { ...column.coding, missing: event.target.value } }) })),
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => runAutoCode(column) }, t('自动编码')),
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => syncColumn(column) }, '同步取值'),
                confirmDel === column.key
                  ? h(
                      'span',
                      { className: 'dc-confirm' },
                      h(Btn, { variant: 'danger', size: 'sm', onClick: () => removeColumn(column.key) }, t('确认删除')),
                      h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setConfirmDel('') }, t('取消'))
                    )
                  : h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setConfirmDel(column.key) }, t('删除变量'))
              ),
              shown.length && column.coding.enabled
                ? h(
                    'div',
                    { className: 'dc-map-grid' },
                    shown.map(value => {
                      const map = column.coding.map || {}
                      const override = map[value] !== undefined ? String(map[value]) : ''
                      const auto = dict ? matchDictValue(dict, value) : null
                      return h(
                        'label',
                        { key: value, className: 'dc-map' },
                        h('span', { className: 'dc-map-value', title: value }, value),
                        h('span', { className: 'dc-map-eq' }, '='),
                        h('input', {
                          className: 'dc-map-input',
                          value: override,
                          placeholder: auto != null ? String(auto) : '—',
                          title: '留空按词典自动编码',
                          onChange: event => setMapping(column, value, event.target.value)
                        }),
                        auto == null && !override ? h('span', { className: 'dc-map-warn', title: t('未编码') }, '!') : null,
                        h('button', {
                          type: 'button',
                          className: 'dc-map-del',
                          title: '从编码维度移除（原始数据仍保留）',
                          'aria-label': '移除取值 ' + value,
                          onClick: event => { event.preventDefault(); event.stopPropagation(); removeDimension(column, value) }
                        }, '×')
                      )
                    }),
                    shownAll.length > shown.length
                      ? h('span', { className: 'dc-map-more' }, '另有 ' + (shownAll.length - shown.length) + ' 个取值，导出时按原文保留')
                      : null
                  )
                : h('p', { className: 'dc-card-note' }, column.coding.enabled ? t('导入问卷或选择模板后即可录入') : '编码已关闭，导出原始文本。'),
              column.coding.enabled ? h(DimensionAdder, { onAdd: (value, code) => addDimension(column, value, code) }) : null,
              ignored.length
                ? h('details', { className: 'dc-ignored' },
                    h('summary', null, '已移除的取值（' + ignored.length + '）'),
                    ignored.map(entry => h('div', { key: entry.value, className: 'dc-ignored-row' },
                      h('span', null, entry.value),
                      h(Btn, { variant: 'ghost', size: 'sm', onClick: () => restoreDimension(column, entry.value) }, '恢复'))))
                : null,
              h(
                'footer',
                { className: 'dc-card-foot' },
                h('span', null, '导出：'),
                h('code', null, options.map(option => option.label + '=' + option.code).slice(0, 10).join(' · ') || '—'),
                column.coding.missing ? h('span', { className: 'dc-missing' }, '缺失=' + column.coding.missing) : null
              )
            )
          })
        ),
        h(
          'div',
          { className: 'dc-addvar' },
          h('input', {
            className: 'dc-input',
            value: newLabel,
            placeholder: '新变量名，例如：专业类别',
            onChange: event => setNewLabel(event.target.value),
            onKeyDown: event => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addVariable()
              }
            }
          }),
          h(
            'select',
            { className: 'dc-select', value: newKind, onChange: event => setNewKind(event.target.value) },
            h('option', { value: 'categorical' }, t('分类')),
            h('option', { value: 'number' }, t('数值')),
            h('option', { value: 'text' }, t('文本'))
          ),
          h(Btn, { variant: 'secondary', onClick: addVariable }, t('添加变量'))
        )
      )
    }

    /* --------------------------------------------------------------- import */

    function ImportTab({ dataset, setDataset, dir, setDir, host, flash, go, selectStudy }) {
      const t = useT()
      const [pending, setPending] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [drag, setDrag] = useState(false)
      const [confirmTemplate, setConfirmTemplate] = useState('')
      const [studyPath, setStudyPath] = useState(host.study?.path || '')
      const [studyName, setStudyName] = useState('')
      const [studyId, setStudyId] = useState('')
      const [dataRoot, setDataRoot] = useState('')
      const inputRef = useRef(null)

      const handleFile = async file => {
        if (!file) return
        setBusy(true)
        setError('')
        setPending(null)
        try {
          const parsed = await readFileMatrix(file)
          if (parsed.kind === 'snapshot') { setPending({ ...parsed, sheetIndex: 0, headerRow: 0 }); return }
          if ((!parsed.sheets || !parsed.sheets.length) && parsed.pairs) {
            setPending({
              name: parsed.name,
              kind: parsed.kind,
              sheets: [],
              sheetIndex: 0,
              headerRow: 0,
              codebook: null,
              pairs: parsed.pairs
            })
            return
          }
          if (!parsed.sheets || !parsed.sheets.length) throw new Error(t('未找到表格'))
          let codebook = null
          let dataIndex = 0
          parsed.sheets.forEach((sheet, index) => {
            const found = detectCodebook(sheet.matrix)
            if (found) {
              codebook = found
              if (index === 0) dataIndex = 1
            }
          })
          const sheetIndex = Math.min(dataIndex, parsed.sheets.length - 1)
          setPending({
            name: parsed.name,
            kind: parsed.kind,
            sheets: parsed.sheets,
            sheetIndex,
            headerRow: detectHeaderRow(parsed.sheets[sheetIndex].matrix),
            codebook,
            pairs: null
          })
        } catch (failure) {
          setError(String((failure && failure.message) || failure))
        } finally {
          setBusy(false)
        }
      }

      const preview = useMemo(() => {
        if (!pending) return null
        try {
          if (pending.dataset) return pending.dataset
          if (pending.pairs) return datasetFromPairs(pending.name, pending.pairs)
          const sheet = pending.sheets[pending.sheetIndex]
          if (!sheet) return null
          const built = datasetFromMatrix(stem(pending.name), sheet.matrix, { headerRow: pending.headerRow, idIndex: pending.idIndex, idWidth: pending.idWidth })
          if (pending.codebook) built.codebookApplied = applyCodebook(built.columns, pending.codebook)
          return built
        } catch (failure) { return { error: failure.message } }
      }, [pending])

      const applyImport = mode => {
        if (!preview || preview.error) return
        try {
          if (pending.dataset && !pending.confirmStudy) {
            setPending(prev => ({ ...prev, confirmStudy: true }))
            setError('快照来源：' + (pending.study?.name || pending.study?.id || '未记录研究身份') + '；当前研究：' + (host.study?.name || host.studyId || '') + '。请核对后再次点击，显式确认将快照恢复到当前研究')
            return
          }
          if (mode === 'replace') {
            if (dataset.rows.length && !pending.confirmReplace) { setPending(prev => ({ ...prev, confirmReplace: true })); setError('替换将移除当前记录；核对后再次点击导入并替换'); return }
            setDataset(pending.dataset ? cloneDataset(preview) : { ...preview, name: stem(pending.name) })
          } else setDataset(mergeDatasets(dataset, preview))
        } catch (failure) { setError(failure.message); return }
        flash('ok', t('导入') + ' · ' + preview.columns.length + ' ' + t('列') + ' / ' + preview.rows.length + ' ' + t('行数'))
        setPending(null)
        go('entry')
      }

      const startTemplate = id => {
        if (dataset.rows.length && confirmTemplate !== id) {
          setConfirmTemplate(id)
          return
        }
        setDataset(templateDataset(id))
        setConfirmTemplate('')
        flash('ok', t('从模板开始') + ' · ' + t(TEMPLATES.find(item => item.id === id).label))
        go('entry')
      }

      return h(
        'div',
        { className: 'dc-import' },
        h(
          'div',
          { className: 'dc-section-head' },
          h('div', null,
            h('h2', null, t('导入与新建')),
            h('p', null, t('导入须知') + ' ' + t('本机处理'))
          )
        ),
        h('section', { className: 'dc-folder' },
          h('h2', null, '研究配置'),
          h('p', null, '当前：' + (host.study?.name || '') + ' · ' + (host.study?.id || '') + ' · ' + (host.study?.dataRoot || '')),
          h('p', { className: 'dc-hint' }, '绑定来源：' + (sourceLabel[host.binding?.source] || host.binding?.source || '未连接') + (host.binding?.instanceId ? ' · 实例 ' + String(host.binding.instanceId).slice(0, 14) : '') + '。连接只改变当前页面，其他页面与会话保留各自的研究绑定。'),
          h('label', null, '研究 JSON 绝对路径', h('input', { className: 'dc-input', value: studyPath, onChange: event => setStudyPath(event.target.value) })),
          h(Btn, { onClick: () => selectStudy?.(studyPath) }, '加载研究配置'),
          h('div', { className: 'dc-folder-row' },
            h('input', { className: 'dc-input', value: studyName, placeholder: '新研究名称', 'aria-label': '新研究名称', onChange: event => setStudyName(event.target.value) }),
            h('input', { className: 'dc-input', value: studyId, placeholder: '新研究 studyId', 'aria-label': '新研究 studyId', onChange: event => setStudyId(event.target.value) }),
            h('input', { className: 'dc-input', value: dataRoot, placeholder: '数据目录（相对配置文件或绝对路径）', 'aria-label': '数据目录', onChange: event => setDataRoot(event.target.value) })),
          h(Btn, { onClick: async () => {
            try {
              newPage()
              await hostCall('createStudy', { studyPath, definition: { schemaVersion: 1, studyId, name: studyName, dataRoot: dataRoot || './data', participantId: {}, visits: [], tasks: [], followups: [], plugins: { demographics: {} } } })
              selectStudy?.(studyPath)
            } catch (failure) { setError(failure.message) }
          } }, '创建并加载研究 JSON')),
        h(
          'div',
          {
            className: 'dc-drop' + (drag ? ' is-drag' : ''),
            onDragOver: event => {
              event.preventDefault()
              setDrag(true)
            },
            onDragLeave: () => setDrag(false),
            onDrop: event => {
              event.preventDefault()
              setDrag(false)
              const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null
              handleFile(file)
            },
            onClick: () => inputRef.current && inputRef.current.click()
          },
          h('input', {
            ref: inputRef,
            type: 'file',
            accept: '.xlsx,.xlsm,.docx,.csv,.txt,.json',
            style: { display: 'none' },
            onChange: event => {
              const file = event.target.files && event.target.files[0]
              handleFile(file)
              event.target.value = ''
            }
          }),
          h('div', { className: 'dc-drop-mark', 'aria-hidden': true }, '⇪'),
          h('strong', null, busy ? t('正在解析') : t('拖入文件')),
          h('span', null, t('或点击选择文件')),
          h('small', null, t('支持格式'))
        ),
        error ? h('div', { className: 'dc-alert dc-alert-bad' }, error) : null,
        pending
          ? h(
              'div',
              { className: 'dc-preview-panel' },
              h(
                'div',
                { className: 'dc-preview-head' },
                h('strong', null, t('文件名') + '：' + pending.name),
                pending.sheets.length > 1
                  ? h(
                      'label',
                      { className: 'dc-inline' },
                      t('工作表'),
                      h(
                        'select',
                        {
                          className: 'dc-select',
                          value: pending.sheetIndex,
                          onChange: event => {
                            const index = Number(event.target.value)
                            const matrix = pending.sheets[index].matrix
                            setPending(prev => ({ ...prev, sheetIndex: index, headerRow: detectHeaderRow(matrix) }))
                          }
                        },
                        pending.sheets.map((item, index) => h('option', { key: item.name + index, value: index }, item.name))
                      )
                    )
                  : null,
                pending.sheets.length
                  ? h(
                      'label',
                      { className: 'dc-inline' },
                      t('表头行'),
                      h('input', {
                        className: 'dc-input dc-input-num',
                        type: 'number',
                        min: 1,
                        value: pending.headerRow + 1,
                        onChange: event => {
                          const value = Math.max(0, Number(event.target.value) - 1 || 0)
                          setPending(prev => ({ ...prev, headerRow: value }))
                        }
                      })
                    )
                  : null,
                pending.sheets.length ? h('label', { className: 'dc-inline' }, '编号列',
                  h('select', { className: 'dc-select', value: pending.idIndex ?? 'auto', onChange: event => setPending(prev => ({ ...prev, idIndex: event.target.value === 'auto' ? undefined : Number(event.target.value) })) },
                    h('option', { value: 'auto' }, '自动识别'), h('option', { value: -1 }, '生成编号'),
                    (pending.sheets[pending.sheetIndex].matrix[pending.headerRow] || []).map((label, index) => h('option', { key: index, value: index }, (index + 1) + ': ' + (label || '空表头'))))) : null,
                pending.sheets.length ? h('label', { className: 'dc-inline' }, '数字编号补零宽度（可选）',
                  h('input', { className: 'dc-input dc-input-num', type: 'number', min: 0, max: 100, value: pending.idWidth || '', onChange: event => setPending(prev => ({ ...prev, idWidth: Math.min(100, Math.max(0, Number(event.target.value) || 0)) })) })) : null,
                pending.codebook ? h(Chip, { tone: 'ok' }, t('检测到编码表')) : null
              ),
              preview?.error ? h('div', { className: 'dc-alert dc-alert-bad', role: 'alert' }, preview.error) : preview
                ? h(
                    'div',
                    { className: 'dc-preview-body' },
                    h(
                      'div',
                      { className: 'dc-preview-stats' },
                      h(Chip, null, t('行', { n: preview.rows.length })),
                      h(Chip, null, t('列', { n: preview.columns.length })),
                      pending.codebook ? h(Chip, { tone: 'ok' }, t('已套用编码表')) : null
                    ),
                    h(
                      'div',
                      { className: 'dc-preview-table' },
                      h(
                        'table',
                        { className: 'dc-table dc-table-mini' },
                        h('thead', null, h('tr', null, h('th', null, t('被试编号')), preview.columns.map(column => h('th', { key: column.key }, column.label)))),
                        h(
                          'tbody',
                          null,
                          preview.rows.slice(0, 5).map(row =>
                            h('tr', { key: row.id }, h('td', null, row.id), preview.columns.map(column => h('td', { key: column.key }, row.values[column.key] || '·')))
                          )
                        )
                      ),
                      !preview.rows.length ? h('p', { className: 'dc-hint' }, '只读到表头，没有数据行；导入后可直接录入。') : null
                    ),
                    h(
                      'div',
                      { className: 'dc-preview-actions' },
                      h(Btn, { variant: 'primary', onClick: () => applyImport('replace') }, t('导入并替换')),
                      h(Btn, { variant: 'secondary', onClick: () => applyImport('append') }, t('追加到现有数据'))
                    )
                  )
                : null
            )
          : null,
        h(
          'div',
          { className: 'dc-templates' },
          TEMPLATES.map(template =>
            h(
              'button',
              { key: template.id, type: 'button', className: 'dc-template', onClick: () => startTemplate(template.id) },
              h('strong', null, t(template.label)),
              h('span', null, template.vars.length ? template.vars.map(id => CODING_BY_ID[id].label).join(' · ') : '自定义变量')
            )
          )
        ),
        confirmTemplate
          ? h(
              'div',
              { className: 'dc-alert dc-alert-warn' },
              t('确认替换'),
              ' ',
              t('当前已有N份', { n: dataset.rows.length }),
              '，',
              t('替换会清空'),
              h(Btn, { variant: 'danger', size: 'sm', onClick: () => startTemplate(confirmTemplate) }, t('确认替换')),
              h(Btn, { variant: 'ghost', size: 'sm', onClick: () => setConfirmTemplate('') }, t('取消'))
            )
          : null,
        h(
          'div',
          { className: 'dc-folder' },
          h('div', { className: 'dc-section-head' }, h('div', null, h('h2', null, t('保存位置')), h('p', null, host.state === 'ok' ? t('保存到') + '：' + (dir || host.defaultDir) : t('设置保存位置')))),
          h('div', { className: 'dc-folder-row' },
            h('input', {
              className: 'dc-input',
              value: dir,
              placeholder: host.defaultDir || '研究导出目录',
              onChange: event => {
                setDir(event.target.value)
                try {
                  localStorage.setItem(LS_DIR + ':' + host.studyId, event.target.value)
                } catch {}
              }
            }),
            h(Btn, {
              variant: 'ghost',
              size: 'sm',
              onClick: () => {
                setDir(host.defaultDir || '')
                try {
                  localStorage.setItem(LS_DIR + ':' + host.studyId, host.defaultDir || '')
                } catch {}
              }
            }, '恢复默认'),
            host.state === 'error' ? h(Chip, { tone: 'bad' }, '本地接口不可用') : null
          ),
          h('p', { className: 'dc-hint' }, 'CSV、编码手册与完整 JSON 快照写入此文件夹；主数据由 Host 保存，浏览器保留此研究的编辑草稿。')
        )
      )
    }

    /* ---------------------------------------------------------------- shell */

    class Boundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      componentDidCatch(error) {
        console.error('[demographic-coder] panel crashed:', error)
      }
      render() {
        if (this.state.error) {
          return h(
            'div',
            { className: 'dc-empty' },
            h('strong', null, '面板渲染失败'),
            h('p', null, String((this.state.error && this.state.error.message) || this.state.error)),
            h(Btn, { variant: 'secondary', onClick: () => this.setState({ error: null }) }, '重试')
          )
        }
        return this.props.children
      }
    }

    /** 最外层护栏：注册到 main 槽的组件本身出错时，显示错误而不是留下一片空白。 */
    class Guard extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }
      static getDerivedStateFromError(error) {
        return { error }
      }
      componentDidCatch(error) {
        console.error('[demographic-coder] panel crashed:', error)
      }
      render() {
        if (this.state.error) {
          const text = String((this.state.error && (this.state.error.stack || this.state.error.message)) || this.state.error)
          return h('div', {
            style: {
              padding: '18px',
              fontFamily: 'Cambria,"Noto Serif SC","Source Han Serif SC","Songti SC",STSong,SimSun,serif',
              fontSize: '12px',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              color: '#b00020',
              overflow: 'auto',
              height: '100%',
              boxSizing: 'border-box'
            }
          }, '人口学录入渲染失败：\n\n' + text + '\n\n（把这段发给我即可定位）')
        }
        return this.props.children
      }
    }

    const TABS = [
      { id: 'entry', label: '录入' },
      { id: 'data', label: '数据' },
      { id: 'coding', label: '编码' },
      { id: 'import', label: '导入' }
    ]

    function Panel() {
      const t = useT()
      const [dataset, replaceDataset] = useState(() => emptyDataset())
      const [loaded, setLoaded] = useState(false)
      const [persistence, setPersistence] = useState('正在加载磁盘数据…')
      const [recovery, setRecovery] = useState(null)
      const [retry, setRetry] = useState(0)
      const syncRef = useRef({ studyId: null, studyPath: null, studyRevision: null, bindingRevision: null, revision: null, saved: null, blocked: false, busy: false })
      const currentRef = useRef(dataset)
      currentRef.current = dataset
      const setDataset = useCallback(change => {
        replaceDataset(previous => typeof change === 'function' ? change(previous) : change)
      }, [])
      const [tab, setTab] = useState(() => {
        try {
          return localStorage.getItem(LS_TAB) || 'entry'
        } catch {
          return 'entry'
        }
      })
      const [notice, setNotice] = useState(null)
      const [dir, setDir] = useState('')
      const [host, setHost] = useState({ state: 'idle', defaultDir: '' })
      const [saving, setSaving] = useState(false)
      const [saved, setSaved] = useState(null)

      const loadHost = useCallback(async (requestedPath = undefined) => {
        if (syncRef.current.studyId && JSON.stringify(currentRef.current) !== syncRef.current.saved && typeof window.confirm === 'function' && !window.confirm('当前编辑尚未保存到磁盘。请先下载 JSON 快照；继续将重新加载磁盘，浏览器草稿保留。')) return
        if (syncRef.current.busy) { setPersistence('正在保存，请完成后重新加载'); return }
        setLoaded(false)
        setPersistence('正在加载磁盘数据…')
        try {
          if (typeof requestedPath === 'string') { newPage(); await hostCall('studyConnect', { studyPath: requestedPath }) }
          const studyPath = undefined
          const [status, data] = await Promise.all([hostCall('status', { studyPath }), hostCall('load', { studyPath })])
          const initial = data.dataset || emptyDataset()
          syncRef.current = { studyId: data.studyId, instanceId: data.binding?.instanceId || data.study?.instanceId || null, datasetName: data.dataset?.name || (initial && initial.name) || null, studyPath: data.study?.path || null, studyRevision: data.studyRevision, bindingRevision: data.binding?.bindingRevision ?? null, revision: data.revision, saved: JSON.stringify(initial), blocked: false, busy: false }
          replaceDataset(initial)
          setHost({ state: 'ok', defaultDir: status.defaultDir || '', studyId: data.studyId, study: data.study, binding: data.binding })
          try {
            const savedDir = localStorage.getItem(LS_DIR + ':' + data.studyId)
            setDir(savedDir || '')
            const draft = loadDataset(data.studyId, data.binding?.instanceId || data.study?.instanceId, data.dataset?.name || initial.name)
            setRecovery(draft && JSON.stringify(draft.dataset) !== JSON.stringify(initial) ? draft : null)
          } catch { setPersistence('磁盘已加载；浏览器草稿存储不可用') }
          setLoaded(true)
          setPersistence('磁盘已加载 · 未修改')
        } catch (failure) {
          setHost({ state: 'error', defaultDir: '' })
          setPersistence('加载失败：' + failure.message + '。请重试加载')
        }
      }, [])
      useEffect(() => { loadHost() }, [loadHost])

      useEffect(() => {
        try {
          localStorage.setItem(LS_TAB, tab)
        } catch {}
      }, [tab])

      useEffect(() => {
        if (!loaded) return
        const state = syncRef.current
        const serialized = JSON.stringify(dataset)
        if (serialized === state.saved) return
        let draftWarning = ''
        try {
          // Write immediately; a failed Host save must leave a recoverable draft.
          localStorage.setItem(draftKey(state.studyId, state.instanceId, dataset.name || state.datasetName), JSON.stringify({ studyId: state.studyId, instanceId: state.instanceId, revision: state.revision, dataset }))
        } catch { draftWarning = '；浏览器草稿写入失败，请下载 JSON 快照'; }
        if (state.blocked) { setPersistence('版本冲突，草稿未保存到磁盘；请下载快照后重新加载' + draftWarning); return }
        setPersistence('尚未保存到磁盘' + draftWarning)
        const timer = setTimeout(async () => {
          if (state.busy || state.blocked) return
          state.busy = true
          setPersistence('正在保存到磁盘…' + draftWarning)
          try {
            const result = await hostCall('sync', { studyPath: state.studyPath, studyRevision: state.studyRevision, studyId: state.studyId, revision: state.revision, dataset })
            state.revision = result.revision
            state.saved = serialized
            // 打开 publishFlow 时，核心发布失败必须让人看见，不能只说"已保存"。
            const publishNote = result.flowError
              ? '；发布到研究核心失败：' + result.flowError
              : (result.flow && result.flow.participants ? '；已发布参与者 ' + (result.flow.participants.created || []).length + ' 人、待关联 ' + (result.flow.participants.pending || []).length + ' 人' : '')
            setPersistence('已保存到磁盘' + publishNote + draftWarning)
            // A newer edit may have arrived while the request was in flight.
            if (JSON.stringify(currentRef.current) !== serialized) setRetry(value => value + 1)
          } catch (failure) {
            if (['conflict', 'study_mismatch'].includes(failure.code)) state.blocked = true
            setPersistence('保存失败：' + failure.message + '。草稿保留，可下载 JSON 快照' + draftWarning)
          } finally { state.busy = false }
        }, 700)
        return () => clearTimeout(timer)
      }, [dataset, loaded, retry])

      useEffect(() => {
        if (!loaded) return
        let disposed = false
        const inspect = async () => {
          try {
            const status = await hostCall('status')
            const state = syncRef.current
            const currentBinding = status.binding?.bindingRevision ?? null
            const staleBinding = state.bindingRevision !== null && currentBinding !== null && currentBinding !== state.bindingRevision
            if (!disposed && (status.study?.id !== state.studyId || status.study?.revision !== state.studyRevision || staleBinding)) {
              state.blocked = true
              setPersistence('研究已由其他页面切换或定义已更新；编辑内容保留为草稿，请下载快照后重新加载')
            }
          } catch (failure) { if (!disposed) { syncRef.current.blocked = true; setPersistence('研究状态检查失败：' + failure.message + '；草稿保留，请重新加载') } }
        }
        const timer = setInterval(inspect, 5000)
        timer?.unref?.()
        window.addEventListener?.('focus', inspect)
        return () => { disposed = true; clearInterval(timer); window.removeEventListener?.('focus', inspect) }
      }, [loaded])

      useEffect(() => {
        const warn = event => {
          if (JSON.stringify(currentRef.current) !== syncRef.current.saved) { event.preventDefault(); event.returnValue = '' }
        }
        window.addEventListener?.('beforeunload', warn)
        return () => window.removeEventListener?.('beforeunload', warn)
      }, [])

      useEffect(() => {
        if (!notice) return
        const timer = setTimeout(() => setNotice(null), 6000)
        return () => clearTimeout(timer)
      }, [notice])

      const flash = useCallback((tone, text) => setNotice({ tone, text, at: Date.now() }), [])

      const go = useCallback(id => setTab(id), [])

      const addRow = useCallback(row => {
        setDataset(prev => ({ ...prev, rows: [...prev.rows, { id: normText(row.id), values: row.values }] }))
      }, [])

      const removeLast = useCallback(() => {
        setDataset(prev => ({ ...prev, rows: prev.rows.slice(0, -1) }))
      }, [])

      const saveToDisk = async () => {
        if (saving) return
        const targetDir = dir || host.defaultDir
        if (!targetDir) {
          flash('bad', t('设置保存位置'))
          setTab('import')
          return
        }
        setSaving(true)
        try {
          const result = await hostCall('save', {
            studyId: syncRef.current.studyId, studyRevision: syncRef.current.studyRevision,
            name: dataset.name,
            dir: targetDir,
            csv: '\ufeff' + datasetCsv(dataset),
            codebook: '\ufeff' + codebookCsv(dataset),
            json: datasetJson(dataset, host.study)
          })
          const primary = result.files.find(file => file.kind === 'data')
          setSaved({
            dir: result.dir,
            path: primary ? primary.path : result.dir,
            name: primary ? primary.name : dataset.name,
            files: result.files
          })
          flash('ok', t('保存成功') + ' · ' + (primary ? primary.name : result.dir))
        } catch (failure) {
          flash('bad', t('保存失败') + ' · ' + String((failure && failure.message) || failure))
        } finally {
          setSaving(false)
        }
      }

      const downloadSnapshot = () => {
        const blob = new Blob([datasetJson(dataset, host.study)], { type: 'application/json;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url; anchor.download = dataset.name + '.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 4000)
      }

      const download = () => {
        downloadCsv(dataset.name + '.csv', datasetCsv(dataset))
        flash('ok', t('已下载') + ' · ' + dataset.name + '.csv')
      }

      const reveal = async () => {
        if (!saved) return
        try {
          await hostCall('reveal', { dir: saved.dir, file: saved.name })
        } catch (failure) {
          flash('bad', String((failure && failure.message) || failure))
        }
      }

      const copyPath = async () => {
        if (!saved) return
        try {
          await navigator.clipboard.writeText(saved.path)
          flash('ok', t('已复制'))
        } catch {
          flash('warn', saved.path)
        }
      }

      if (!loaded) return h('div', { className: 'dc-root' },
        h('div', { className: 'dc-alert', role: host.state === 'error' ? 'alert' : 'status' }, persistence),
        host.state === 'error' ? h(Btn, { onClick: () => loadHost() }, '重试加载') : null,
        host.state === 'error' && syncRef.current.studyPath ? h(Btn, { onClick: () => loadHost(syncRef.current.studyPath) }, '重新连接当前研究配置') : null)

      return h(
        'div',
        { className: 'dc-root' },
        h('button', { className: 'dc-btn dc-btn-quiet', type: 'button', style: { margin: '0 0 10px' }, onClick: openPickerFromButton }, '研究切换'),
        h(
          'header',
          { className: 'dc-top' },
          h(
            'div',
            { className: 'dc-brand' },
            h(Icon, { size: 26 }),
            h(
              'div',
              { className: 'dc-brand-text' },
              h('strong', null, '人口学变量录入'),
              h('input', {
                className: 'dc-name',
                value: dataset.name,
                title: t('文件名'),
                onChange: event => setDataset(prev => ({ ...prev, name: event.target.value }))
              })
            )
          ),
          h(
            'nav',
            { className: 'dc-tabs', role: 'tablist' },
            TABS.map(item =>
              h(
                'button',
                {
                  key: item.id,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': tab === item.id,
                  className: 'dc-tab' + (tab === item.id ? ' is-active' : ''),
                  onClick: () => setTab(item.id)
                },
                t(item.label)
              )
            )
          ),
          h(
            'div',
            { className: 'dc-top-right' },
            h('span', { className: 'dc-total' }, t('已录入', { n: dataset.rows.length })),
            h(Btn, { variant: 'ghost', size: 'sm', onClick: download }, t('下载CSV')),
            h(Btn, { variant: 'primary', size: 'sm', onClick: saveToDisk, disabled: saving }, saving ? t('正在保存') : t('保存CSV'))
          )
        ),
        h('div', { className: 'dc-alert', role: 'status', 'aria-live': 'polite' },
          h('span', null, (host.study?.name || '') + ' [' + (host.study?.id || '') + '] · ' + persistence),
          h(Btn, { variant: 'ghost', size: 'sm', onClick: downloadSnapshot }, '下载JSON快照'),
          h(Btn, { variant: 'ghost', size: 'sm', disabled: syncRef.current.blocked, onClick: () => setRetry(value => value + 1) }, '重试保存'),
          h(Btn, { variant: 'ghost', size: 'sm', onClick: loadHost }, '重新加载磁盘')),
        recovery ? h('div', { className: 'dc-alert dc-alert-warn', role: 'status' },
          '此研究有尚未恢复的浏览器草稿；磁盘数据已优先加载。',
          h(Btn, { onClick: () => {
            const draft = recovery
            setRecovery(null)
            replaceDataset(draft.dataset)
            if (draft.revision !== syncRef.current.revision) {
              syncRef.current.blocked = true
              setPersistence('草稿来自旧版本，请下载快照并核对后合并')
            }
          } }, '恢复草稿到编辑区')) : null,
        notice
          ? h('div', { className: 'dc-alert dc-alert-' + notice.tone }, h('span', null, notice.text))
          : null,
        saved
          ? h(
              'div',
              { className: 'dc-saved' },
              h('span', { className: 'dc-saved-path', title: saved.path }, t('已保存') + ' · ' + saved.path),
              h(Btn, { variant: 'ghost', size: 'sm', onClick: reveal }, t('打开文件夹')),
              h(Btn, { variant: 'ghost', size: 'sm', onClick: copyPath }, t('复制路径')),
              h('button', { type: 'button', className: 'dc-saved-close', 'aria-label': t('取消'), onClick: () => setSaved(null) }, '×')
            )
          : null,
        h(
          'div',
          { className: 'dc-body' },
          tab === 'entry'
            ? h(EntryTab, { dataset, addRow, removeLast, flash, go })
            : tab === 'data'
              ? h(DataTab, { dataset, setDataset, flash, go })
              : tab === 'coding'
                ? h(CodingTab, { dataset, setDataset, flash })
                : h(ImportTab, { dataset, setDataset, dir, setDir, host, flash, go, selectStudy: path => loadHost(path) })
        )
      )
    }

    /* ================================================================== *
     * dataset shims used by the views
     * ================================================================== */

    function canonicalValue(column, raw) {
      const value = normText(raw)
      if (!value) return ''
      const options = effectiveOptions(column)
      const hit = options.find(
        option => normKey(option.label) === normKey(value) || normKey(option.code) === normKey(value)
      )
      return hit ? hit.label : value
    }

    function datasetFromPairs(name, pairs) {
      const columns = []
      const values = {}
      for (const [label, value] of Object.entries(pairs)) {
        if (columns.some(column => normKey(column.label) === normKey(label))) continue
        const column = columnFromLabel(label, columns)
        columns.push(column)
        values[column.key] = normText(value)
      }
      return { name: stem(name), columns, rows: columns.length ? [{ id: '1', values }] : [] }
    }

    /* ================================================================== *
     * styles
     * ================================================================== */

    const CSS = `
.dc-root{
  --dc-bg:#f5f4ef;--dc-sunk:#eeede6;--dc-panel:#fbfaf6;--dc-raised:#fffefb;--dc-alt:#f2f0e9;
  --dc-line:#e3dfd4;--dc-line-soft:#eceade;--dc-line-strong:#cdc7b7;
  --dc-text:#24221f;--dc-text-2:#5b564d;--dc-text-3:#726c62;
  --dc-accent:#c46e4f;--dc-accent-deep:#a55a3c;--dc-accent-darker:#8b4526;
  --dc-accent-soft:#f4e5dd;--dc-accent-soft-2:#efd8cc;--dc-accent-line:#d6b3a0;--dc-on-accent:#fdfbf7;
  --dc-ok:#3f6b4f;--dc-ok-soft:#e4ebe1;--dc-warn:#7d5810;--dc-warn-soft:#f3ead3;
  --dc-bad:#9b3a2c;--dc-bad-soft:#f4dfd9;--dc-info:#3f5a70;--dc-info-soft:#e2e8ec;
  display:flex;flex-direction:column;height:100%;min-height:0;
  background:var(--dc-bg);color:var(--dc-text);color-scheme:light;
  font-family:Cambria,"Noto Serif SC","Source Han Serif SC","Songti SC",STSong,SimSun,serif;
  font-size:14.5px;line-height:1.6;letter-spacing:0;overflow:hidden;
  -webkit-font-smoothing:antialiased
}
.dc-root *{box-sizing:border-box}
.dc-root :where(button,input,select,textarea){font-family:inherit;font-size:inherit;line-height:inherit;color:inherit}
.dc-root :where(code,kbd,pre,samp,output){font-family:inherit;color:inherit}
.dc-root ::selection{background:var(--dc-accent-soft-2);color:var(--dc-text)}
.dc-root *{scrollbar-width:thin;scrollbar-color:var(--dc-line-strong) transparent}

/* ------------------------------------------------------------- top bar */
.dc-top{display:flex;align-items:center;gap:20px;min-height:56px;padding:0 20px;border-bottom:1px solid var(--dc-line);flex:none;background:var(--dc-panel)}
.dc-brand{display:flex;align-items:center;gap:10px;min-width:0}
.dc-brand-text{display:flex;flex-direction:column;line-height:1.25;min-width:0}
.dc-brand-text strong{font-size:15.5px;font-weight:600;letter-spacing:0;color:var(--dc-text)}
.dc-name{width:184px;height:26px;padding:0 7px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--dc-text-2);font-size:13px;outline:none}
.dc-name:hover{border-color:var(--dc-line)}
.dc-name:focus{border-color:var(--dc-line-strong);background:var(--dc-raised);color:var(--dc-text);outline:2px solid var(--dc-accent-deep);outline-offset:2px}
.dc-tabs{display:flex;align-items:center;gap:20px;padding:0;border:0;background:transparent}
.dc-tab{border:0;background:transparent;color:var(--dc-text-2);padding:0 2px;height:38px;display:inline-flex;align-items:center;border-bottom:2px solid transparent;border-radius:0;cursor:pointer;font-size:14.5px;white-space:nowrap}
.dc-tab:hover{color:var(--dc-text)}
.dc-tab.is-active{color:var(--dc-text);font-weight:600;border-bottom-color:var(--dc-accent-deep);background:transparent;box-shadow:none}
.dc-top-right{display:flex;align-items:center;gap:10px;margin-left:auto}
.dc-top-right .dc-btn-ghost{background:var(--dc-raised);border-color:var(--dc-line);color:var(--dc-text)}
.dc-top-right .dc-btn-ghost:hover:not(:disabled){background:var(--dc-alt);border-color:var(--dc-line-strong)}
/* 品牌图标保留形状，只把品牌蓝/绿换成陶土色系 */
.dc-brand svg>rect:first-of-type{fill:var(--dc-accent-deep)}
.dc-brand svg>rect:nth-of-type(2){fill:var(--dc-on-accent)}
.dc-brand svg>rect:nth-of-type(n+3){fill:var(--dc-accent-deep)}
.dc-brand svg>circle{fill:var(--dc-accent);stroke:var(--dc-accent-deep)}
.dc-total{font-size:13px;color:var(--dc-text-2);font-variant-numeric:tabular-nums;white-space:nowrap}

/* -------------------------------------------------------------- buttons */
.dc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 14px;border-radius:5px;border:1px solid transparent;background:transparent;color:var(--dc-text);font-size:14px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .14s ease,border-color .14s ease,color .14s ease}
.dc-btn-md{height:34px;padding:0 14px;font-size:14px}
.dc-btn-sm{height:28px;padding:0 10px;font-size:13px;border-radius:5px}
.dc-btn:disabled{background:var(--dc-alt);border-color:var(--dc-line);color:var(--dc-text-3);cursor:not-allowed}
.dc-btn-default{background:var(--dc-raised);border-color:var(--dc-line);color:var(--dc-text)}
.dc-btn-default:hover:not(:disabled){border-color:var(--dc-line-strong);background:var(--dc-panel)}
.dc-btn-primary{background:var(--dc-accent-deep);border-color:var(--dc-accent-deep);color:var(--dc-on-accent)}
.dc-btn-primary:hover:not(:disabled){background:var(--dc-accent-darker);border-color:var(--dc-accent-darker);color:var(--dc-on-accent)}
.dc-btn-secondary{background:var(--dc-raised);border-color:var(--dc-line-strong);color:var(--dc-text)}
.dc-btn-secondary:hover:not(:disabled){background:var(--dc-alt);border-color:var(--dc-text-3)}
.dc-btn-ghost{background:transparent;border-color:transparent;color:var(--dc-text-2)}
.dc-btn-ghost:hover:not(:disabled){background:var(--dc-alt);color:var(--dc-text)}
.dc-btn-danger{background:var(--dc-bad);border-color:var(--dc-bad);color:var(--dc-on-accent)}
.dc-btn-danger:hover:not(:disabled){background:#852b1f;border-color:#852b1f;color:var(--dc-on-accent)}
.dc-btn:focus-visible,.dc-tab:focus-visible,.dc-input:focus-visible,.dc-select:focus-visible,
.dc-cell-input:focus-visible,.dc-map-input:focus-visible,.dc-template:focus-visible,
.dc-empty-actions .dc-btn:focus-visible,.dc-saved-close:focus-visible,.dc-row-del:focus-visible{
  outline:2px solid var(--dc-accent-deep);outline-offset:2px
}

/* --------------------------------------------------------------- alerts */
.dc-alert{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 20px;font-size:13px;line-height:1.6;border-bottom:1px solid var(--dc-line-soft);background:var(--dc-panel);color:var(--dc-text-2);flex:none}
.dc-alert-ok{color:var(--dc-ok);background:var(--dc-ok-soft);border-bottom-color:#cddbcb}
.dc-alert-warn{color:var(--dc-warn);background:var(--dc-warn-soft);border-bottom-color:#e6d9b8}
.dc-alert-bad{color:var(--dc-bad);background:var(--dc-bad-soft);border-bottom-color:#e6c6bf}
.dc-saved{display:flex;align-items:center;gap:10px;padding:8px 20px;border-bottom:1px solid #d3ded0;background:var(--dc-ok-soft);font-size:12.5px;color:var(--dc-ok);flex:none}
.dc-saved-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;line-height:1.7;letter-spacing:.012em;color:var(--dc-text-2);background:var(--dc-raised);border:1px solid #cfdac9;border-radius:4px;padding:1px 8px}
.dc-saved-close{border:0;background:transparent;color:var(--dc-text-3);cursor:pointer;font-size:16px;line-height:1;padding:2px 4px;border-radius:4px}
.dc-saved-close:hover{color:var(--dc-bad);background:var(--dc-bad-soft)}

.dc-body{flex:1;min-height:0;display:flex;flex-direction:column}

/* ---------------------------------------------------------- page shells */
.dc-entry,.dc-coding,.dc-import{flex:1;min-height:0;overflow:auto;padding:26px 24px 52px}
.dc-entry{display:flex;flex-direction:column}
.dc-entry>*{width:100%;max-width:920px;margin-left:auto;margin-right:auto}

/* ------------------------------------------------------------ entry card */
.dc-entry-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:18px 22px 15px;background:var(--dc-panel);border:1px solid var(--dc-line);border-bottom:0;border-radius:7px 7px 0 0}
.dc-entry-head h2{font-size:21px;line-height:1.24;margin:0 0 4px;font-weight:600;letter-spacing:0;color:var(--dc-text)}
.dc-entry-head p{margin:0;font-size:13px;color:var(--dc-text-2)}
.dc-idbox{display:flex;align-items:center;gap:9px;font-size:13px;color:var(--dc-text-2);white-space:nowrap}
.dc-input{width:100%;height:38px;padding:0 11px;border:1px solid var(--dc-line-strong);border-radius:5px;background:var(--dc-raised);color:var(--dc-text);font-size:14.5px;outline:none;transition:border-color .14s ease}
.dc-input::placeholder{color:var(--dc-text-3);opacity:.85}
.dc-input:hover{border-color:var(--dc-text-3)}
.dc-input:focus{border-color:var(--dc-accent-deep);outline:2px solid var(--dc-accent-deep);outline-offset:2px}
.dc-input-id,.dc-input.dc-input-id{width:88px;height:34px;text-align:center;font-variant-numeric:tabular-nums;font-size:14px}
.dc-input.dc-input-num{width:70px;height:32px;text-align:center;font-variant-numeric:tabular-nums;font-size:13.5px}
.dc-value{min-width:0}
.dc-form{border:1px solid var(--dc-line);border-radius:0 0 7px 7px;background:var(--dc-panel);padding:20px 22px 0}
.dc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 26px}
.dc-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.dc-field-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;row-gap:2px;min-width:0}
.dc-field-label{font-size:13.5px;font-weight:600;color:var(--dc-text)}
.dc-field-key{font-size:11px;line-height:1.6;letter-spacing:.012em;color:var(--dc-text-3);background:var(--dc-alt);border:1px solid var(--dc-line-soft);border-radius:3px;padding:0 5px;white-space:nowrap}
.dc-field-foot{min-height:19px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font-size:12.5px;line-height:1.5}
.dc-code{color:var(--dc-accent-deep);font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
.dc-code-warn{color:var(--dc-warn);font-weight:500;white-space:nowrap}
.dc-code-bad{color:var(--dc-bad);font-weight:500;white-space:nowrap}
.dc-legend{color:var(--dc-text-3);font-size:12.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-entry-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:20px -22px 0;padding:13px 22px;border-top:1px solid var(--dc-line);background:var(--dc-alt);border-radius:0 0 6px 6px}
.dc-preview{display:flex;gap:9px;align-items:baseline;flex-wrap:wrap;min-width:0;font-size:12.5px}
.dc-preview-label{color:var(--dc-text-2);white-space:nowrap;font-weight:600}
.dc-preview .dc-preview-body{font-size:12.5px;line-height:1.7;letter-spacing:.012em;color:var(--dc-text-2);background:var(--dc-raised);border:1px solid var(--dc-line);border-radius:4px;padding:1px 8px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.dc-entry-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}

/* ------------------------------------------------------- recent entries */
.dc-recent{margin-top:24px}
.dc-recent-head{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;color:var(--dc-text-2);margin-bottom:8px}
.dc-recent ul{list-style:none;margin:0;padding:0}
.dc-recent li{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:14px;align-items:center;padding:8px 12px;border:1px solid var(--dc-line-soft);border-radius:5px;margin-bottom:6px;background:var(--dc-panel);font-size:13.5px}
.dc-recent-id{font-variant-numeric:tabular-nums;color:var(--dc-text-2);font-weight:600}
.dc-recent-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dc-text)}
.dc-recent-code{font-size:12.5px;line-height:1.7;letter-spacing:.012em;color:var(--dc-text-3);font-variant-numeric:tabular-nums;white-space:nowrap}

/* ------------------------------------------------------------ data table */
.dc-data{flex:1;min-height:0;display:flex;flex-direction:column}
.dc-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid var(--dc-line);background:var(--dc-panel);flex:none}
.dc-input.dc-search{width:240px;height:34px;font-size:13.5px}
.dc-toolbar-count{font-size:12.5px;color:var(--dc-text-2);font-variant-numeric:tabular-nums;padding:0 2px}
.dc-spacer{flex:1}
.dc-confirm{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--dc-warn);background:var(--dc-warn-soft);border:1px solid #e6d9b8;border-radius:5px;padding:2px 8px}
.dc-table-wrap{flex:1;min-height:0;overflow:auto;padding:0 20px 28px}
.dc-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13.5px;font-variant-numeric:tabular-nums}
.dc-table th{position:sticky;top:0;z-index:2;background:var(--dc-alt);text-align:left;padding:11px 10px 9px;border-bottom:1px solid var(--dc-line-strong);font-weight:600;white-space:nowrap;color:var(--dc-text)}
.dc-th-label{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis;font-size:13.5px;font-weight:600}
.dc-th-key{display:inline-block;margin-top:2px;font-size:10.5px;line-height:1.6;letter-spacing:.012em;font-weight:400;color:var(--dc-text-3);background:var(--dc-raised);border:1px solid var(--dc-line-soft);border-radius:3px;padding:0 5px}
.dc-th-id{width:104px}
.dc-table td{border-bottom:1px solid var(--dc-line-soft);padding:3px 6px;min-width:104px;position:relative;vertical-align:middle}
.dc-table tbody tr:hover td{background:var(--dc-alt)}
.dc-td-id{width:104px}
.dc-cell-input{width:100%;height:32px;padding:0 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dc-text);font-size:13.5px;outline:none}
.dc-cell-input:hover{border-color:var(--dc-line)}
.dc-cell-input:focus{border-color:var(--dc-accent-deep);background:var(--dc-raised)}
.dc-cell-input[aria-invalid="true"]{border-color:#d8a99b;background:var(--dc-bad-soft);color:var(--dc-bad)}
.dc-cell-id{text-align:center;font-variant-numeric:tabular-nums;color:var(--dc-text-2);font-weight:600}
.dc-row-del{position:absolute;right:2px;top:50%;transform:translateY(-50%);width:20px;height:20px;border:1px solid transparent;border-radius:4px;background:transparent;color:var(--dc-text-3);cursor:pointer;opacity:0;font-size:14px;line-height:1;padding:0}
.dc-table tbody tr:hover .dc-row-del,.dc-row-del:focus-visible{opacity:1}
.dc-row-del:hover{background:var(--dc-bad-soft);border-color:#dcb3aa;color:var(--dc-bad)}
.dc-cell-code{display:block;padding:6px 8px;font-size:13px;line-height:1.7;letter-spacing:.012em;font-variant-numeric:tabular-nums;color:var(--dc-text-2)}
.dc-table-empty,.dc-table-more{padding:18px;text-align:center;font-size:13px;color:var(--dc-text-3)}
.dc-table-empty{background:var(--dc-panel);border:1px solid var(--dc-line-soft);border-top:0;border-radius:0 0 5px 5px}

/* ---------------------------------------------------------------- coding */
.dc-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap}
.dc-section-head h2{font-size:17px;line-height:1.3;margin:0;font-weight:600;color:var(--dc-text)}
.dc-section-head p{margin:6px 0 0;font-size:13px;line-height:1.6;color:var(--dc-text-2);max-width:72ch}
.dc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(332px,1fr));gap:14px;margin-top:18px}
.dc-card{border:1px solid var(--dc-line);border-radius:7px;background:var(--dc-panel);padding:15px 16px 14px;display:flex;flex-direction:column;gap:12px;min-width:0}
.dc-card-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dc-card-title{display:flex;align-items:baseline;gap:7px;min-width:0;flex-wrap:wrap}
.dc-card-title strong{font-size:15px;font-weight:600;color:var(--dc-text)}
.dc-card-title code{font-size:10.5px;line-height:1.6;letter-spacing:.012em;color:var(--dc-text-3);background:var(--dc-alt);border:1px solid var(--dc-line-soft);border-radius:3px;padding:0 5px}
.dc-card-count{margin-left:auto;font-size:12px;color:var(--dc-text-3);font-variant-numeric:tabular-nums;white-space:nowrap}
.dc-card-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:11px;border-top:1px solid var(--dc-line-soft)}
.dc-select{height:30px;padding:0 8px;border:1px solid var(--dc-line-strong);border-radius:5px;background:var(--dc-raised);color:var(--dc-text);font-size:13px;outline:none;cursor:pointer}
.dc-select:hover{border-color:var(--dc-text-3)}
.dc-select:focus{border-color:var(--dc-accent-deep);outline:2px solid var(--dc-accent-deep);outline-offset:2px}
.dc-switch{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--dc-text-2);cursor:pointer;user-select:none}
.dc-switch input{width:15px;height:15px;accent-color:var(--dc-accent-deep);margin:0}
.dc-inline{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--dc-text-2)}
.dc-map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:7px}
.dc-map{display:flex;align-items:center;gap:7px;border:1px solid var(--dc-line-soft);border-radius:5px;padding:3px 8px;background:var(--dc-raised);min-width:0}
.dc-map-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--dc-text)}
.dc-map-eq{color:var(--dc-text-3);font-size:12px}
.dc-map-input{width:46px;height:26px;text-align:center;border:1px solid var(--dc-line-strong);border-radius:4px;background:var(--dc-panel);font-size:13px;color:var(--dc-text);font-variant-numeric:tabular-nums;outline:none}
.dc-map-input:focus{border-color:var(--dc-accent-deep)}
.dc-map-warn{color:var(--dc-warn);font-weight:600;font-size:12.5px}
.dc-map-more{grid-column:1/-1;font-size:12px;color:var(--dc-text-3)}
.dc-map-del{flex:none;width:20px;height:20px;padding:0;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--dc-text-3);font-size:15px;line-height:1;cursor:pointer}
.dc-map-del:hover{background:var(--dc-bad-soft);border-color:#e0c1b7;color:var(--dc-bad)}
.dc-dimadd{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;padding-top:8px;border-top:1px solid var(--dc-line-soft)}
.dc-dimadd .dc-input{height:30px;font-size:13px;padding:0 8px}
.dc-dimadd-value{flex:1 1 130px;min-width:0}
.dc-dimadd-code{width:70px;flex:none;text-align:center}
.dc-ignored{margin-top:8px;border-top:1px solid var(--dc-line-soft);padding-top:7px}
.dc-ignored summary{cursor:pointer;font-size:12.5px;color:var(--dc-text-3);outline:none}
.dc-ignored summary:hover{color:var(--dc-text)}
.dc-ignored-row{display:flex;align-items:center;gap:8px;justify-content:space-between;padding:3px 0;font-size:12.5px;color:var(--dc-text-2)}
.dc-ignored-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-card-note{margin:0;font-size:13px;line-height:1.6;color:var(--dc-text-3)}
.dc-card-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--dc-line-soft);font-size:12px;color:var(--dc-text-3)}
.dc-card-foot code{color:var(--dc-text-2);font-size:12.5px;line-height:1.7;letter-spacing:.012em;font-variant-numeric:tabular-nums}
.dc-missing{color:var(--dc-warn)}
.dc-addvar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;padding:14px;border:1px dashed var(--dc-line-strong);border-radius:7px;background:var(--dc-sunk)}
.dc-addvar .dc-input{max-width:320px;height:34px}

/* ---------------------------------------------------------------- import */
.dc-import{max-width:960px;margin:0 auto;width:100%}
.dc-folder{margin-top:26px;padding-top:18px;border-top:1px solid var(--dc-line)}
.dc-folder h2{font-size:17px;line-height:1.3;margin:0;font-weight:600;color:var(--dc-text)}
.dc-folder p{margin:6px 0 0;font-size:13px;line-height:1.6;color:var(--dc-text-2)}
.dc-folder label{display:block;margin-top:12px;font-size:13px;color:var(--dc-text-2)}
.dc-folder label>input{display:block;width:100%;margin-top:6px}
.dc-folder-row{display:flex;align-items:center;gap:10px;margin-top:12px;flex-wrap:wrap}
.dc-folder-row .dc-input{flex:1 1 180px;min-width:0;height:36px}
.dc-hint{margin:10px 0 0;font-size:12.5px;line-height:1.75;color:var(--dc-text-3)}
.dc-drop{display:flex;flex-direction:column;align-items:center;gap:5px;padding:26px 24px;margin-top:18px;border:1px dashed var(--dc-accent-line);border-radius:7px;background:var(--dc-accent-soft);cursor:pointer;text-align:center;transition:background .15s ease,border-color .15s ease}
.dc-drop:hover,.dc-drop.is-drag{background:var(--dc-accent-soft-2);border-color:var(--dc-accent)}
.dc-drop-mark{font-size:22px;color:var(--dc-accent-deep);line-height:1.1}
.dc-drop strong{font-size:15px;font-weight:600;color:var(--dc-text)}
.dc-drop span{font-size:13px;color:var(--dc-text-2)}
.dc-drop small{font-size:12px;color:var(--dc-text-3)}
.dc-preview-panel{margin-top:16px;border:1px solid var(--dc-line);border-radius:7px;background:var(--dc-panel);padding:15px 16px}
.dc-preview-panel .dc-preview-body{display:block;min-width:0;background:transparent;border:0;padding:0;max-width:none;white-space:normal}
.dc-preview-head{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.dc-preview-head strong{font-size:15px;font-weight:600;max-width:52ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dc-text)}
.dc-preview-stats{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 10px}
.dc-preview-table{max-height:240px;overflow:auto;border:1px solid var(--dc-line);border-radius:5px;background:var(--dc-raised)}
.dc-preview-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:14px}
.dc-table-mini{font-size:13px}
.dc-table-mini th{padding:9px 10px}
.dc-table-mini td{padding:7px 10px;min-width:0;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis;color:var(--dc-text-2)}
.dc-templates{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:20px}
.dc-template{display:flex;flex-direction:column;gap:6px;text-align:left;padding:14px 15px;border:1px solid var(--dc-line);border-radius:5px;background:var(--dc-raised);cursor:pointer;transition:border-color .15s ease,background .15s ease}
.dc-template:hover{border-color:var(--dc-accent);background:var(--dc-accent-soft)}
.dc-template strong{font-size:14px;font-weight:600;color:var(--dc-text)}
.dc-template span{font-size:12.5px;color:var(--dc-text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ----------------------------------------------------------------- chips */
.dc-chip{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:4px;border:1px solid var(--dc-line);background:var(--dc-alt);font-size:12.5px;color:var(--dc-text-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.dc-chip-brand{color:var(--dc-accent-deep);border-color:var(--dc-accent-soft-2);background:var(--dc-accent-soft)}
.dc-chip-ok{color:var(--dc-ok);border-color:#cadac6;background:var(--dc-ok-soft)}
.dc-chip-bad{color:var(--dc-bad);border-color:#e1bdb4;background:var(--dc-bad-soft)}
.dc-chip-muted{color:var(--dc-text-3);background:transparent}

/* --------------------------------------------------------- empty states */
.dc-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:56px 24px;color:var(--dc-text-2);text-align:center;background:var(--dc-bg)}
.dc-empty-mark{width:46px;height:46px;border-radius:7px;border:1px dashed var(--dc-accent-line);background:var(--dc-accent-soft);display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;color:var(--dc-accent-deep)}
.dc-empty strong{font-size:17px;line-height:1.3;color:var(--dc-text);font-weight:600}
.dc-empty p{margin:0;max-width:46ch;font-size:13.5px;line-height:1.7}
.dc-empty-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:8px}

/* ------------------------------------------------------------ responsive */
@media (max-width:1100px){
.dc-cards{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}
}
@media (max-width:820px){
.dc-top{flex-wrap:wrap;align-items:center;gap:12px;padding:10px 16px;min-height:56px}
.dc-brand{flex:1 1 auto}
.dc-name{width:148px}
.dc-tabs{order:3;flex:1 1 100%;gap:18px;border-top:1px solid var(--dc-line-soft);padding-top:2px;margin-top:2px}
.dc-tab{height:36px}
.dc-top-right{margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.dc-entry,.dc-coding,.dc-import{padding:20px 16px 40px}
.dc-entry-head{flex-wrap:wrap;align-items:flex-start;gap:12px;padding:16px 18px 13px}
.dc-form{padding:18px 18px 0}
.dc-entry-foot{margin:18px -18px 0;padding:12px 18px}
.dc-fields{grid-template-columns:1fr}
.dc-cards{grid-template-columns:1fr}
.dc-table-wrap{padding:0 16px 24px}
.dc-table{min-width:560px}
.dc-toolbar{padding:10px 16px}
}
@media (max-width:560px){
.dc-top{padding:10px 14px;row-gap:8px}
.dc-brand-text strong{font-size:15px}
.dc-name{width:132px}
.dc-tabs{gap:14px;justify-content:space-between}
.dc-tab{height:38px;font-size:14.5px}
.dc-total{display:none}
.dc-alert,.dc-saved{padding:8px 14px;font-size:12.5px}
.dc-entry,.dc-coding,.dc-import{padding:16px 12px 32px}
.dc-entry-head{flex-direction:column;align-items:stretch;gap:10px;padding:15px 14px 12px}
.dc-entry-head h2{font-size:21px}
.dc-idbox{justify-content:space-between;width:100%}
.dc-input.dc-input-id{width:96px;height:36px}
.dc-form{padding:16px 14px 0}
.dc-entry-foot{margin:16px -14px 0;padding:12px 14px;flex-direction:column;align-items:stretch;gap:10px}
.dc-entry-actions{justify-content:stretch;gap:8px}
.dc-entry-actions .dc-btn{flex:1 1 auto;min-width:0}
.dc-preview{width:100%}
.dc-recent li{grid-template-columns:56px minmax(0,1fr);gap:6px 12px}
.dc-recent-code{grid-column:1/-1;white-space:normal}
.dc-input.dc-search{width:100%;flex:1 1 100%}
.dc-toolbar{row-gap:8px}
.dc-toolbar .dc-btn{height:32px}
.dc-table-wrap{padding:0 12px 20px}
.dc-table{min-width:520px}
.dc-card{padding:14px}
.dc-map-grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr))}
.dc-addvar .dc-input{max-width:none;flex:1 1 100%}
.dc-folder-row .dc-input{flex:1 1 100%}
.dc-drop{padding:20px 16px}
.dc-preview-actions .dc-btn{flex:1 1 140px}
.dc-saved{flex-wrap:wrap}
.dc-saved-path{flex:1 1 100%}
.dc-row-del{opacity:.7}
}
@media (max-width:430px){
.dc-root{font-size:15px}
.dc-btn{height:40px;font-size:15px;padding:0 12px}
.dc-btn-sm{height:38px;font-size:14px;padding:0 9px}
.dc-input{height:42px;font-size:16px}
.dc-input.dc-input-id{height:42px;font-size:16px;width:104px}
.dc-input.dc-search,.dc-input.dc-input-num{height:42px;font-size:16px}
.dc-dimadd .dc-input{height:40px;font-size:15px}
.dc-dimadd .dc-dimadd-code{width:76px}
.dc-map-del{width:28px;height:28px;font-size:18px}
.dc-select{height:38px;font-size:14px}
.dc-cell-input{height:36px;font-size:14px}
.dc-tab{font-size:15px;gap:4px}
.dc-tabs{gap:12px}
.dc-drop strong{font-size:16px}
.dc-drop span,.dc-drop small{font-size:13px}
.dc-preview-actions .dc-btn{flex:1 1 100%}
.dc-empty{padding:40px 16px}
}
`

    function insertStyles() {
      const mark = 'demographic-coder'
      if (document.querySelector('style[data-plugin-css="' + mark + '"]')) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = mark
      tag.dataset.pluginCss = mark
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => tag.remove()
    }

    /* ================================================================== *
     * mounting
     * ================================================================== */

    function mount(ctx) {
      const locale = ctx.get ? ctx.get('locale') : undefined
      function PanelHost() {
        // 只读一次语言，不订阅：locale 服务缺失或 snapshot 每次返回新对象时，
        // useSyncExternalStore 会无限重渲染（React error #185）。
        const active = useMemo(() => {
          try {
            const snap = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : null
            return String(
              (snap && (snap.active || snap.locale)) ||
              (typeof navigator !== 'undefined' ? navigator.language : 'zh')
            )
          } catch {
            return 'zh'
          }
        }, [])
        const t = translator(active)
        return h(TContext.Provider, { value: t }, h(Boundary, null, h(Panel, null)))
      }
      return PanelHost
    }

    if (typeof globalThis.__DC_TEST__ === 'object' && globalThis.__DC_TEST__ !== null) {
      globalThis.__DC_TEST__.api = {
        parseXlsx,
        parseDocx,
        parseCsv,
        toCsv,
        parseXml,
        trimMatrix,
        datasetFromMatrix,
        datasetFromPairs,
        buildColumns,
        detectHeaderRow,
        detectCodebook,
        applyCodebook,
        mergeDatasets,
        datasetCsv,
        codebookCsv,
        datasetJson,
        parseSnapshot,
        nextParticipantId,
        valueProblem,
        suggestDictValue,
        draftKey,
        loadDataset,
        codeOf,
        canonicalValue,
        matchDictByLabel,
        matchDictValue,
        effectiveOptions,
        templateDataset,
        columnFromLabel,
        readFileMatrix,
        Panel,
        EntryTab,
        DataTab,
        CodingTab,
        ImportTab
      }
    }

  function openPickerFromButton() {
    try {
      const ui = (hostCtx && hostCtx.get && hostCtx.get('uiWorkspace')) || (hostCtx && hostCtx.uiWorkspace)
      const factory = window.__DSH_RESEARCH_PICKER__
      if (!factory) throw new Error('共享选择器模块未加载')
      const picker = factory.createStudyPicker({
        plugin: 'demographic-coder', route: '/api/demographic-coder',
        headers: () => ({ 'x-demographic-coder': '1', ...identity.headers() }),
        pickDirectory: ui && typeof ui.pickDirectory === 'function' ? () => ui.pickDirectory() : null,
      })
      picker.install(); picker.open()
    } catch (error) {
      try { window.alert('研究选择器不可用：' + (error && error.message ? error.message : String(error))) } catch { /* 无窗口 */ }
    }
  }

    return {
      inject: ['slots'],
      identity,
      apply(ctx) {
        hostCtx = ctx
        ctx.effect(() => insertStyles(), 'demographic-coder: styles')
        try {
          const ui = (ctx.get && ctx.get('uiWorkspace')) || ctx.uiWorkspace
          window.__DSH_RESEARCH_PICKER__ && window.__DSH_RESEARCH_PICKER__.createStudyPicker({
            plugin: 'demographic-coder', route: '/api/demographic-coder', headers: () => ({ 'x-demographic-coder': '1', ...identity.headers() }),
            pickDirectory: ui && typeof ui.pickDirectory === 'function' ? () => ui.pickDirectory() : null,
          }).install()
        } catch (error) { console.warn('[demographic-coder] study picker not installed', error) }
        const PanelHost = mount(ctx)
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: 'demographic-coder', order: 30, label: '人口学录入' },
            props => h(Icon, { size: (props && props.size) || 18, active: Boolean(props && props.active) })
          )
        )
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'demographic-coder' }, () => h(Guard, null, h(PanelHost))))
      }
    }
  }
})
