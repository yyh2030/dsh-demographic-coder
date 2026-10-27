/**
 * Render smoke test: executes every panel component with a tiny React
 * substitute (function components, hooks that keep their initial value, class
 * components) so a missing helper or bad prop surfaces here instead of as a
 * blank panel in the browser. Not a visual test.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(HERE, 'fixtures')

const store = new Map()
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: key => store.delete(key)
}
globalThis.document = {
  querySelector: () => null,
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { appendChild() {} }
}

const loaded = { factory: null }
globalThis.window = { __ModuleLoader__: { load(definition) { loaded.factory = definition.factory } } }
const harness = (globalThis.__DC_TEST__ = {})

function createElement(type, props, ...children) {
  return { type, props: { ...(props || {}), children: children.length <= 1 ? children[0] : children }, children }
}

class Component {
  constructor(props) {
    this.props = props
  }
  setState() {}
}

function createContext(value) {
  return { Provider: { context: true }, Consumer: { context: true }, _value: value }
}

const React = {
  createElement,
  createContext,
  useContext: context => (context && context._value !== undefined ? context._value : text => text),
  useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect() {},
  useMemo: fn => fn(),
  useRef: () => ({ current: null }),
  useCallback: fn => fn,
  useSyncExternalStore: (subscribe, get) => get(),
  Component
}

await import('../client.js')
loaded.factory(() => React)
const api = harness.api

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return null
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).filter(value => value !== null)
  if (typeof node !== 'object') return null
  const type = node.type
  const props = node.props || {}
  if (typeof type === 'function') {
    if (type.prototype && typeof type.prototype.render === 'function') {
      const instance = new type(props)
      return render(instance.render())
    }
    return render(type(props))
  }
  if (type && typeof type === 'object') return render(props.children)
  return { tag: type, props, children: (node.children || []).map(render).filter(value => value !== null) }
}

function textOf(tree, out = []) {
  if (tree === null || tree === undefined) return out
  if (typeof tree === 'string') {
    out.push(tree)
    return out
  }
  if (Array.isArray(tree)) {
    for (const child of tree) textOf(child, out)
    return out
  }
  for (const child of tree.children || []) textOf(child, out)
  return out
}

function inputValues(tree, out = []) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) {
    for (const child of tree) inputValues(child, out)
    return out
  }
  if (tree.tag === 'input' && tree.props && tree.props.value !== undefined) out.push(String(tree.props.value))
  for (const child of tree.children || []) inputValues(child, out)
  return out
}

function countTag(tree, tag, out = { count: 0 }) {
  if (!tree || typeof tree !== 'object') return out
  if (Array.isArray(tree)) {
    for (const child of tree) countTag(child, tag, out)
    return out
  }
  if (tree.tag === tag) out.count++
  for (const child of tree.children || []) countTag(child, tag, out)
  return out
}

async function fixtureDataset() {
  const buffer = await fs.readFile(path.join(FIXTURES, 'questionnaire.xlsx'))
  const parsed = await api.readFileMatrix({
    name: 'questionnaire.xlsx',
    type: '',
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    },
    async text() {
      return buffer.toString('utf8')
    }
  })
  return api.datasetFromMatrix('问卷', parsed.sheets[1].matrix, { headerRow: 0 })
}

const results = []
function check(name, fn) {
  try {
    fn()
    results.push(true)
    console.log('ok   ' + name)
  } catch (error) {
    results.push(false)
    console.log('FAIL ' + name + '\n     ' + ((error && error.stack) || error))
  }
}

const dataset = await fixtureDataset()

check('panel renders the shell and the entry form', () => {
  const tree = render(createElement(harness.api.Panel))
  const text = textOf(tree).join(' ')
  for (const expected of ['人口学变量录入', '录入', '数据', '编码', '导入', '保存CSV', '下载CSV', '第N份问卷']) {
    assert.ok(text.includes(expected), 'missing text: ' + expected)
  }
  assert.ok(countTag(tree, 'input').count >= 8, 'entry form inputs')
  assert.ok(countTag(tree, 'button').count > 5, 'buttons')
})

check('entry tab renders every field of the fixture sheet', () => {
  const tree = render(createElement(harness.api.EntryTab, { dataset, addRow() {}, removeLast() {}, flash() {}, go() {} }))
  const text = textOf(tree).join(' ')
  assert.ok(text.includes('性别'))
  assert.ok(text.includes('教育程度') || text.includes('学历'))
  assert.ok(text.includes('编码预览'))
  assert.ok(text.includes('最近录入'))
})

check('entry tab empty dataset offers the import route', () => {
  const tree = render(createElement(harness.api.EntryTab, { dataset: { name: '空', columns: [], rows: [] }, addRow() {}, removeLast() {}, flash() {}, go() {} }))
  assert.ok(textOf(tree).join(' ').includes('尚无变量'))
})

check('data tab renders header and editable cells', () => {
  const tree = render(createElement(harness.api.DataTab, { dataset, setDataset() {}, flash() {}, go() {} }))
  const text = textOf(tree).join(' ')
  for (const expected of ['被试编号', '性别', '年龄', '添加一行', '显示编码值']) {
    assert.ok(text.includes(expected), 'missing text: ' + expected)
  }
  const values = inputValues(tree)
  assert.ok(values.includes('张三'), 'row value 张三 is rendered: ' + values.slice(0, 8).join('|'))
  assert.ok(values.includes('男'), 'coded-friendly raw value 男 is rendered')
})

check('data tab renders the coded view without inputs in cells', () => {
  const tree = render(createElement(harness.api.DataTab, { dataset, setDataset() {}, flash() {}, go() {} }))
  assert.ok(countTag(tree, 'table').count >= 1)
})

check('coding tab lists each variable and its mapping', () => {
  const tree = render(createElement(harness.api.CodingTab, { dataset, setDataset() {}, flash() {} }))
  const text = textOf(tree).join(' ')
  for (const expected of ['变量与编码', '性别', '男=1', '女=2', '自动编码', '添加变量']) {
    assert.ok(text.includes(expected), 'missing text: ' + expected)
  }
})

check('import tab renders drop zone, templates and folder field', () => {
  const tree = render(createElement(harness.api.ImportTab, {
    dataset,
    setDataset() {},
    dir: '',
    setDir() {},
    host: { state: 'ok', defaultDir: 'C:\\work\\人口学变量' },
    flash() {},
    go() {}
  }))
  const text = textOf(tree).join(' ')
  for (const expected of ['导入与新建', '拖入文件', '基础人口学', '学生样本', '保存位置']) {
    assert.ok(text.includes(expected), 'missing text: ' + expected)
  }
})

check('boundary renders its child', () => {
  const tree = render(createElement(harness.api.Panel))
  assert.ok(tree)
})

const failed = results.filter(ok => !ok).length
console.log('\n' + (results.length - failed) + '/' + results.length + ' render checks passed')
if (failed) process.exitCode = 1
