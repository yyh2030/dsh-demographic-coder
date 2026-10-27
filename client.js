/**
 * demographic-coder — browser half.
 *
 * A demographic-variable workbench that lives beside the conversation:
 * import Excel / Word / CSV questionnaires (categories are read from the
 * file), key the same variables in as a fill-in form for paper rounds, then
 * export a coded CSV plus its codebook and a JSON snapshot into the folder
 * the user picks.
 *
 * Parsing happens in the page (zip + XML, no dependency), the only Host work
 * is writing the export, so nothing leaves the machine.
 */
window.__ModuleLoader__.load({
  id: '@local/demographic-coder',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React

    const API = '/api/demographic-coder'
    const LS_DATA = 'dc:dataset:v1'
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
          ['1', ['未婚', '单身', '未结婚']],
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
        id: 'study',
        label: '本实验基本信息表',
        vars: ['sex', 'handedness', 'age', 'birthDate', 'eduYears', 'eduLevel', 'grade',
               'ethnicity', 'birthPlace', 'currentResidence', 'marital', 'fillDate']
      },
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
      for (const opt of entry.options) {
        const labels = opt.labels.map(label => normKey(label)).sort((a, b) => b.length - a.length)
        for (const label of labels) if (label.length >= 1 && value.includes(label)) return opt.code
      }
      return null
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
      if (!value) return ''
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
      if (dict) for (const opt of dict.options) out.set(opt.label, opt.code)
      const map = (column && column.coding && column.coding.map) || {}
      for (const [key, code] of Object.entries(map)) {
        if (/^-?\d+(\.\d+)?$/.test(key)) continue
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
      if (!base) base = 'v' + (index + 1)
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
      let idIndex = -1
      const firstLabel = normKey(header[0])
      if (firstLabel && ID_LABELS.some(label => normKey(label) === firstLabel)) idIndex = 0
      const dataRows = rows.slice(headerRow + 1)
      const columns = buildColumns(header, dataRows, idIndex === 0 ? { skip: [0] } : {})
      const out = rowsFromMatrix(dataRows, columns)
      if (idIndex >= 0) {
        out.forEach((row, index) => {
          const id = normText(dataRows[index] ? dataRows[index][idIndex] : '')
          row.id = id || String(index + 1)
        })
      }
      if (!columns.length) {
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

    function mergeDatasets(current, incoming) {
      const columns = current.columns.map(column => ({ ...column, coding: { ...column.coding, map: { ...column.coding.map } } }))
      const mapping = new Map(columns.map(column => [normKey(column.label), column.key]))
      const used = new Set(columns.map(column => column.key))
      for (const column of incoming.columns) {
        const signature = normKey(column.label)
        if (mapping.has(signature)) continue
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
        rows.push({ id: String(rows.length + 1), values })
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

    function datasetJson(dataset) {
      return JSON.stringify({
        name: dataset.name,
        exportedAt: new Date().toISOString(),
        columns: dataset.columns.map(column => ({
          key: column.key,
          label: column.label,
          kind: column.kind,
          coding: column.coding && column.coding.enabled ? { map: column.coding.map, missing: column.coding.missing || '' } : null
        })),
        rows: dataset.rows.map((row, index) => ({ id: normText(row.id) || String(index + 1), ...row.values }))
      }, null, 2)
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

    function loadDataset() {
      try {
        const raw = localStorage.getItem(LS_DATA)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Array.isArray(parsed.columns) || !Array.isArray(parsed.rows)) return null
        parsed.columns = parsed.columns.map(column => ({
          key: String(column.key),
          label: String(column.label || column.key),
          kind: column.kind === 'number' ? 'number' : column.kind === 'categorical' ? 'categorical' : 'text',
          dict: String(column.dict || ''),
          coding: {
            enabled: Boolean(column.coding && column.coding.enabled),
            map: (column.coding && column.coding.map) || {},
            missing: (column.coding && column.coding.missing) || ''
          },
          source: Number.isFinite(column.source) ? column.source : 0
        }))
        parsed.rows = parsed.rows.map((row, index) => ({
          id: String(row.id || index + 1),
          values: row.values && typeof row.values === 'object' ? row.values : {}
        }))
        return { name: String(parsed.name || '人口学数据'), columns: parsed.columns, rows: parsed.rows }
      } catch {
        return null
      }
    }

    async function hostCall(action, payload) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demographic-coder': '1' },
        body: JSON.stringify({ action, payload: payload || {} })
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body || !body.ok) {
        const message = body && body.error && body.error.message ? body.error.message : 'HTTP ' + response.status
        throw new Error(message)
      }
      return body.data
    }

    async function hostStatus() {
      const response = await fetch(API + '?action=status', { headers: { 'x-demographic-coder': '1' } })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body || !body.ok) throw new Error('人口学录入的本地接口不可用')
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
      const nextId = useMemo(() => {
        let max = 0
        for (const row of dataset.rows) {
          const parsed = parseInt(row.id, 10)
          if (Number.isFinite(parsed) && parsed > max) max = parsed
        }
        return String(max + 1)
      }, [dataset.rows])
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
        addRow({ id: normText(draftId) || nextId, values })
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
          let max = 0
          for (const row of prev.rows) {
            const parsed = parseInt(row.id, 10)
            if (Number.isFinite(parsed) && parsed > max) max = parsed
          }
          return { ...prev, rows: [...prev.rows, { id: String(max + 1), values: {} }] }
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
            h('p', null, '分类变量按「原始值 = 编码」导出；留空的编码按内置词典自动匹配（如 男=1、女=2）。')
          )
        ),
        h(
          'div',
          { className: 'dc-cards' },
          columns.map(column => {
            const options = effectiveOptions(column)
            const observed = uniqueMap[column.key] || []
            const dict = column.dict ? CODING_BY_ID[column.dict] : null
            const shownAll = observed.length ? observed : options.map(option => option.label)
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
                h('span', { className: 'dc-card-count' }, observed.length + ' ' + t('所有值'))
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
                    onChange: event => patchColumn(column.key, { coding: { ...column.coding, enabled: event.target.checked } })
                  }),
                  h('span', null, '编码')
                ),
                h(Btn, { variant: 'ghost', size: 'sm', onClick: () => runAutoCode(column) }, t('自动编码')),
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
                        auto == null && !override ? h('span', { className: 'dc-map-warn', title: t('未编码') }, '!') : null
                      )
                    }),
                    shownAll.length > shown.length
                      ? h('span', { className: 'dc-map-more' }, '另有 ' + (shownAll.length - shown.length) + ' 个取值，导出时按原文保留')
                      : null
                  )
                : h('p', { className: 'dc-card-note' }, column.coding.enabled ? t('导入问卷或选择模板后即可录入') : '编码已关闭，导出原始文本。'),
              h(
                'footer',
                { className: 'dc-card-foot' },
                h('span', null, '导出：'),
                h('code', null, options.map(option => option.label + '=' + option.code).slice(0, 6).join(' · ') || '—'),
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

    function ImportTab({ dataset, setDataset, dir, setDir, host, flash, go }) {
      const t = useT()
      const [pending, setPending] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [drag, setDrag] = useState(false)
      const [confirmTemplate, setConfirmTemplate] = useState('')
      const inputRef = useRef(null)

      const handleFile = async file => {
        if (!file) return
        setBusy(true)
        setError('')
        setPending(null)
        try {
          const parsed = await readFileMatrix(file)
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
        if (pending.pairs) return datasetFromPairs(pending.name, pending.pairs)
        const sheet = pending.sheets[pending.sheetIndex]
        if (!sheet) return null
        const built = datasetFromMatrix(stem(pending.name), sheet.matrix, { headerRow: pending.headerRow })
        if (pending.codebook) built.codebookApplied = applyCodebook(built.columns, pending.codebook)
        return built
      }, [pending])

      const applyImport = mode => {
        if (!preview) return
        if (mode === 'replace') setDataset({ ...preview, name: stem(pending.name) })
        else setDataset(prev => mergeDatasets(prev, preview))
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
            accept: '.xlsx,.xlsm,.docx,.csv,.txt',
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
                pending.codebook ? h(Chip, { tone: 'ok' }, t('检测到编码表')) : null
              ),
              preview
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
              placeholder: host.defaultDir || 'D:\\论文\\数据',
              onChange: event => {
                setDir(event.target.value)
                try {
                  localStorage.setItem(LS_DIR, event.target.value)
                } catch {}
              }
            }),
            h(Btn, {
              variant: 'ghost',
              size: 'sm',
              onClick: () => {
                setDir(host.defaultDir || '')
                try {
                  localStorage.setItem(LS_DIR, host.defaultDir || '')
                } catch {}
              }
            }, '恢复默认'),
            host.state === 'error' ? h(Chip, { tone: 'bad' }, '本地接口不可用') : null
          ),
          h('p', { className: 'dc-hint' }, 'CSV 与编码手册会写入该文件夹；数据同时保留在本机浏览器里，刷新不丢。')
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
              fontFamily: 'ui-monospace,Consolas,monospace',
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
      const [dataset, setDataset] = useState(() => loadDataset() || templateDataset('core'))
      const [tab, setTab] = useState(() => {
        try {
          return localStorage.getItem(LS_TAB) || 'entry'
        } catch {
          return 'entry'
        }
      })
      const [notice, setNotice] = useState(null)
      const [dir, setDir] = useState(() => {
        try {
          return localStorage.getItem(LS_DIR) || ''
        } catch {
          return ''
        }
      })
      const [host, setHost] = useState({ state: 'idle', defaultDir: '' })
      const [saving, setSaving] = useState(false)
      const [saved, setSaved] = useState(null)

      useEffect(() => {
        hostStatus()
          .then(data => setHost({ state: 'ok', defaultDir: data.defaultDir || '' }))
          .catch(() => setHost({ state: 'error', defaultDir: '' }))
      }, [])

      useEffect(() => {
        try {
          localStorage.setItem(LS_TAB, tab)
        } catch {}
      }, [tab])

      useEffect(() => {
        const timer = setTimeout(() => {
          try {
            localStorage.setItem(LS_DATA, JSON.stringify(dataset))
          } catch {}
        }, 300)
        return () => clearTimeout(timer)
      }, [dataset])

      // 把当前数据集镜像到 <项目>/_lab/demographics.json，
      // 实验运行台据此显示「人口学完成度」。镜像失败不影响录入。
      useEffect(() => {
        const timer = setTimeout(() => {
          hostCall('sync', {
            name: dataset.name,
            columns: dataset.columns.map(column => ({ key: column.key, label: column.label, kind: column.kind })),
            rows: dataset.rows.map((row, index) => ({ id: normText(row.id) || String(index + 1), ...row.values }))
          }).catch(() => {})
        }, 1200)
        return () => clearTimeout(timer)
      }, [dataset])

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
            name: dataset.name,
            dir: targetDir,
            csv: '\ufeff' + datasetCsv(dataset),
            codebook: '\ufeff' + codebookCsv(dataset),
            json: datasetJson(dataset)
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

      return h(
        'div',
        { className: 'dc-root' },
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
                : h(ImportTab, { dataset, setDataset, dir, setDir, host, flash, go })
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
.dc-root{--dc-bg:var(--dsw-alias-bg-base,#fff);--dc-panel:var(--dsw-alias-bg-layer-1,#f7f7f8);--dc-raised:var(--dsw-alias-bg-layer-2,#f1f2f4);--dc-line:var(--dsw-alias-border-l1,rgba(0,0,0,.09));--dc-line-2:var(--dsw-alias-border-l2,rgba(0,0,0,.16));--dc-text:var(--dsw-alias-label-primary,#16181d);--dc-text-2:var(--dsw-alias-label-secondary,#5b6068);--dc-brand:var(--dsw-alias-brand-primary,#3f5efb);--dc-ok:var(--dsw-alias-state-success-primary,#148a62);--dc-warn:var(--dsw-alias-state-warn-primary,#b7791f);--dc-bad:var(--dsw-alias-state-error-primary,#c0392b);display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dc-bg);color:var(--dc-text);font-size:13px;line-height:1.55;overflow:hidden}
.dc-root *{box-sizing:border-box}
.dc-root :where(button,input,select,textarea){font:inherit}
.dc-root :where(input,select,textarea){color:inherit}
.dc-root ::selection{background:color-mix(in oklab,var(--dc-brand) 26%,transparent)}
.dc-root *{scrollbar-width:thin;scrollbar-color:var(--dc-line-2) transparent}
.dc-top{display:flex;align-items:center;gap:14px;height:56px;padding:0 16px;border-bottom:1px solid var(--dc-line);flex:none;background:var(--dc-bg)}
.dc-brand{display:flex;align-items:center;gap:9px;min-width:0}
.dc-brand-text{display:flex;flex-direction:column;line-height:1.2;min-width:0}
.dc-brand-text strong{font-size:13.5px;letter-spacing:.01em}
.dc-name{width:168px;height:22px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dc-text-2);font-size:11.5px;outline:none}
.dc-name:hover{border-color:var(--dc-line)}
.dc-name:focus{border-color:var(--dc-brand);background:var(--dc-bg);color:var(--dc-text)}
.dc-tabs{display:flex;align-items:center;gap:2px;padding:3px;border-radius:9px;background:var(--dc-raised);border:1px solid var(--dc-line)}
.dc-tab{border:0;background:transparent;color:var(--dc-text-2);padding:4px 13px;border-radius:7px;cursor:pointer;font-size:12.5px;white-space:nowrap}
.dc-tab:hover{color:var(--dc-text);background:color-mix(in oklab,var(--dc-bg) 60%,transparent)}
.dc-tab.is-active{background:var(--dc-bg);color:var(--dc-text);font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08),0 0 0 1px var(--dc-line) inset}
.dc-top-right{display:flex;align-items:center;gap:8px;margin-left:auto}
.dc-total{font-size:11.5px;color:var(--dc-text-2);font-variant-numeric:tabular-nums}
.dc-body{flex:1;min-height:0;display:flex;flex-direction:column}
.dc-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 13px;border-radius:8px;border:1px solid transparent;font-size:12.5px;cursor:pointer;white-space:nowrap;transition:background .14s ease,border-color .14s ease,color .14s ease}
.dc-btn:disabled{opacity:.55;cursor:default}
.dc-btn-sm{height:27px;padding:0 9px;font-size:11.5px;border-radius:7px}
.dc-btn-default{background:var(--dc-raised);border-color:var(--dc-line);color:var(--dc-text)}
.dc-btn-default:hover:not(:disabled){border-color:var(--dc-line-2)}
.dc-btn-primary{background:var(--dc-brand);color:var(--dsw-alias-bg-base,#fff)}
.dc-btn-primary:hover:not(:disabled){filter:brightness(1.06)}
.dc-btn-secondary{background:var(--dc-bg);border-color:var(--dc-line-2);color:var(--dc-text)}
.dc-btn-secondary:hover:not(:disabled){background:var(--dc-raised)}
.dc-btn-ghost{background:transparent;color:var(--dc-text-2)}
.dc-btn-ghost:hover:not(:disabled){background:var(--dc-raised);color:var(--dc-text)}
.dc-btn-danger{background:var(--dc-bad);color:#fff}
.dc-btn:focus-visible,.dc-tab:focus-visible,.dc-input:focus-visible,.dc-select:focus-visible,.dc-cell-input:focus-visible{outline:2px solid color-mix(in oklab,var(--dc-brand) 60%,transparent);outline-offset:1px}
.dc-alert{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 16px;font-size:12px;border-bottom:1px solid var(--dc-line);flex:none}
.dc-alert-ok{color:var(--dc-ok);background:color-mix(in oklab,var(--dc-ok) 9%,transparent)}
.dc-alert-warn{color:var(--dc-warn);background:color-mix(in oklab,var(--dc-warn) 10%,transparent)}
.dc-alert-bad{color:var(--dc-bad);background:color-mix(in oklab,var(--dc-bad) 9%,transparent)}
.dc-saved{display:flex;align-items:center;gap:8px;padding:5px 16px;border-bottom:1px solid var(--dc-line);background:color-mix(in oklab,var(--dc-ok) 7%,transparent);font-size:11.5px;flex:none}
.dc-saved-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:11px;color:var(--dc-text-2)}
.dc-saved-close{border:0;background:transparent;color:var(--dc-text-2);cursor:pointer;font-size:15px;line-height:1}
.dc-entry,.dc-coding,.dc-import{flex:1;min-height:0;overflow:auto;padding:24px 28px 56px}
.dc-entry{display:flex;flex-direction:column}
.dc-entry>*{width:100%;max-width:840px;margin-left:auto;margin-right:auto}
.dc-entry-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px}
.dc-entry-head h2{font-size:19px;margin:0 0 3px;font-weight:650;letter-spacing:-.01em}
.dc-entry-head p{margin:0;font-size:12px;color:var(--dc-text-2)}
.dc-idbox{display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--dc-text-2);white-space:nowrap}
.dc-input{width:100%;height:34px;padding:0 10px;border:1px solid var(--dc-line);border-radius:8px;background:var(--dc-bg);color:var(--dc-text);font-size:13px;outline:none;transition:border-color .14s ease,box-shadow .14s ease}
.dc-input:hover{border-color:var(--dc-line-2)}
.dc-input:focus{border-color:var(--dc-brand);box-shadow:0 0 0 3px color-mix(in oklab,var(--dc-brand) 16%,transparent)}
.dc-input-id{width:76px;height:30px;text-align:center;font-variant-numeric:tabular-nums}
.dc-form{border:1px solid var(--dc-line);border-radius:14px;background:var(--dc-panel);padding:20px 22px 18px}
.dc-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px 24px}
.dc-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.dc-field-head{display:flex;align-items:baseline;gap:7px}
.dc-field-label{font-size:12.5px;font-weight:600}
.dc-field-key{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--dc-text-2);opacity:.75}
.dc-field-foot{min-height:15px;display:flex;gap:10px;align-items:center;font-size:10.5px}
.dc-code{color:var(--dc-brand);font-variant-numeric:tabular-nums;font-weight:600}
.dc-code-warn{color:var(--dc-warn);font-weight:500}
.dc-legend{color:var(--dc-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-entry-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:18px;padding-top:14px;border-top:1px dashed var(--dc-line)}
.dc-preview{display:flex;gap:8px;align-items:baseline;font-size:11px;min-width:0}
.dc-preview-label{color:var(--dc-text-2);white-space:nowrap}
.dc-preview-body{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dc-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-entry-actions{display:flex;gap:8px;align-items:center}
.dc-recent{margin-top:22px}
.dc-recent-head{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--dc-text-2);margin-bottom:6px}
.dc-recent ul{list-style:none;margin:0;padding:0}
.dc-recent li{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:10px;align-items:center;padding:6px 10px;border:1px solid var(--dc-line);border-radius:8px;margin-bottom:5px;background:var(--dc-panel);font-size:11.5px}
.dc-recent-id{font-variant-numeric:tabular-nums;color:var(--dc-text-2)}
.dc-recent-body{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-recent-code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px;color:var(--dc-text-2)}
.dc-data{flex:1;min-height:0;display:flex;flex-direction:column}
.dc-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--dc-line);flex:none}
.dc-search{width:220px;height:30px;font-size:12px}
.dc-toolbar-count{font-size:11px;color:var(--dc-text-2);font-variant-numeric:tabular-nums}
.dc-spacer{flex:1}
.dc-confirm{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dc-warn)}
.dc-table-wrap{flex:1;min-height:0;overflow:auto;padding:0 20px 28px}
.dc-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12.5px}
.dc-table th{position:sticky;top:0;z-index:2;background:var(--dc-bg);text-align:left;padding:9px 8px 7px;border-bottom:1px solid var(--dc-line-2);font-weight:600;white-space:nowrap}
.dc-th-label{display:block;max-width:180px;overflow:hidden;text-overflow:ellipsis}
.dc-th-key{display:block;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:9.5px;font-weight:400;color:var(--dc-text-2);opacity:.8}
.dc-th-id{width:96px}
.dc-table td{border-bottom:1px solid var(--dc-line);padding:2px 4px;min-width:92px;position:relative}
.dc-table tbody tr:hover td{background:color-mix(in oklab,var(--dc-raised) 55%,transparent)}
.dc-td-id{width:96px}
.dc-cell-input{width:100%;height:30px;padding:0 6px;border:1px solid transparent;border-radius:6px;background:transparent;font-size:12.5px;outline:none}
.dc-cell-input:hover{border-color:var(--dc-line)}
.dc-cell-input:focus{border-color:var(--dc-brand);background:var(--dc-bg);box-shadow:0 0 0 2px color-mix(in oklab,var(--dc-brand) 15%,transparent)}
.dc-cell-id{text-align:center;font-variant-numeric:tabular-nums;color:var(--dc-text-2)}
.dc-row-del{position:absolute;right:2px;top:50%;transform:translateY(-50%);width:18px;height:18px;border:0;border-radius:50%;background:transparent;color:var(--dc-text-2);cursor:pointer;opacity:0;font-size:13px;line-height:1}
.dc-table tbody tr:hover .dc-row-del{opacity:1}
.dc-row-del:hover{background:color-mix(in oklab,var(--dc-bad) 14%,transparent);color:var(--dc-bad)}
.dc-cell-code{display:block;padding:5px 6px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
.dc-table-empty,.dc-table-more{padding:14px;text-align:center;font-size:11.5px;color:var(--dc-text-2)}
.dc-coding{flex:1;min-height:0;overflow:auto;padding:24px 28px 56px}
.dc-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap}
.dc-section-head h2{font-size:15.5px;margin:0;font-weight:650}
.dc-section-head p{margin:4px 0 0;font-size:11.5px;color:var(--dc-text-2);max-width:72ch}
.dc-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;margin-top:16px}
.dc-card{border:1px solid var(--dc-line);border-radius:12px;background:var(--dc-panel);padding:13px 14px;display:flex;flex-direction:column;gap:10px;min-width:0}
.dc-card-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.dc-card-title{display:flex;align-items:baseline;gap:6px;min-width:0}
.dc-card-title strong{font-size:13px;font-weight:650}
.dc-card-title code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10px;color:var(--dc-text-2);opacity:.8}
.dc-card-count{margin-left:auto;font-size:10.5px;color:var(--dc-text-2);font-variant-numeric:tabular-nums}
.dc-card-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:9px;border-top:1px dashed var(--dc-line)}
.dc-select{height:28px;padding:0 6px;border:1px solid var(--dc-line);border-radius:7px;background:var(--dc-bg);font-size:11.5px;outline:none;cursor:pointer}
.dc-select:hover{border-color:var(--dc-line-2)}
.dc-switch{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--dc-text-2);cursor:pointer;user-select:none}
.dc-switch input{width:13px;height:13px;accent-color:var(--dc-brand);margin:0}
.dc-map-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:6px}
.dc-map{display:flex;align-items:center;gap:4px;border:1px solid var(--dc-line);border-radius:7px;padding:2px 6px;background:var(--dc-bg);min-width:0}
.dc-map-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px}
.dc-map-eq{color:var(--dc-text-2);font-size:11px}
.dc-map-input{width:42px;height:24px;text-align:center;border:1px solid var(--dc-line);border-radius:5px;background:var(--dc-bg);font-size:11.5px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;outline:none}
.dc-map-input:focus{border-color:var(--dc-brand)}
.dc-map-warn{color:var(--dc-warn);font-weight:700;font-size:11px}
.dc-map-more{grid-column:1/-1;font-size:10.5px;color:var(--dc-text-2)}
.dc-card-note{margin:0;font-size:11px;color:var(--dc-text-2)}
.dc-card-foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-top:8px;border-top:1px dashed var(--dc-line);font-size:10.5px;color:var(--dc-text-2)}
.dc-card-foot code{color:var(--dc-text);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:10.5px}
.dc-missing{color:var(--dc-warn)}
.dc-addvar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px;padding:12px;border:1px dashed var(--dc-line-2);border-radius:10px}
.dc-addvar .dc-input{max-width:300px;height:30px}
.dc-import{flex:1;min-height:0;overflow:auto;padding:24px 28px 56px;max-width:920px;margin:0 auto;width:100%}
.dc-drop{display:flex;flex-direction:column;align-items:center;gap:3px;padding:24px;margin-top:16px;border:2px dashed var(--dc-line-2);border-radius:14px;background:var(--dc-panel);cursor:pointer;text-align:center;transition:border-color .15s ease,background .15s ease}
.dc-drop:hover,.dc-drop.is-drag{border-color:var(--dc-brand);background:color-mix(in oklab,var(--dc-brand) 6%,transparent)}
.dc-drop-mark{font-size:22px;color:var(--dc-brand);line-height:1}
.dc-drop strong{font-size:13px;font-weight:650}
.dc-drop span{font-size:11.5px;color:var(--dc-text-2)}
.dc-drop small{font-size:10.5px;color:var(--dc-text-2);opacity:.85}
.dc-preview-panel{margin-top:14px;border:1px solid var(--dc-line);border-radius:12px;background:var(--dc-panel);padding:13px 14px}
.dc-preview-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dc-preview-head strong{font-size:12.5px;max-width:52ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-inline{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dc-text-2)}
.dc-input-num{width:62px;height:28px;text-align:center}
.dc-preview-stats{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 8px}
.dc-preview-table{max-height:230px;overflow:auto;border:1px solid var(--dc-line);border-radius:8px;background:var(--dc-bg)}
.dc-table-mini{font-size:11.5px}
.dc-table-mini th{padding:6px 8px}
.dc-table-mini td{padding:5px 8px;min-width:0;white-space:nowrap;max-width:220px;overflow:hidden;text-overflow:ellipsis}
.dc-preview-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
.dc-templates{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:18px}
.dc-template{display:flex;flex-direction:column;gap:4px;text-align:left;padding:12px;border:1px solid var(--dc-line);border-radius:10px;background:var(--dc-panel);cursor:pointer;transition:border-color .15s ease,transform .15s ease}
.dc-template:hover{border-color:var(--dc-line-2);transform:translateY(-1px)}
.dc-template strong{font-size:12.5px;font-weight:650}
.dc-template span{font-size:10.5px;color:var(--dc-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dc-folder{margin-top:24px;padding-top:16px;border-top:1px solid var(--dc-line)}
.dc-folder-row{display:flex;align-items:center;gap:8px;margin-top:10px}
.dc-hint{margin:8px 0 0;font-size:11px;color:var(--dc-text-2)}
.dc-chip{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;border:1px solid var(--dc-line);background:var(--dc-raised);font-size:10.5px;color:var(--dc-text-2);white-space:nowrap;font-variant-numeric:tabular-nums}
.dc-chip-brand{color:var(--dc-brand);border-color:color-mix(in oklab,var(--dc-brand) 36%,var(--dc-line));background:color-mix(in oklab,var(--dc-brand) 8%,transparent)}
.dc-chip-ok{color:var(--dc-ok);border-color:color-mix(in oklab,var(--dc-ok) 36%,var(--dc-line));background:color-mix(in oklab,var(--dc-ok) 8%,transparent)}
.dc-chip-bad{color:var(--dc-bad);border-color:color-mix(in oklab,var(--dc-bad) 36%,var(--dc-line));background:color-mix(in oklab,var(--dc-bad) 8%,transparent)}
.dc-chip-muted{opacity:.8}
.dc-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:48px 24px;color:var(--dc-text-2);text-align:center}
.dc-empty-mark{width:38px;height:38px;border-radius:50%;border:1px dashed var(--dc-line-2);display:flex;align-items:center;justify-content:center;font-size:17px;color:var(--dc-text-2)}
.dc-empty strong{font-size:14px;color:var(--dc-text);font-weight:650}
.dc-empty p{margin:0;font-size:12px;max-width:44ch}
.dc-empty-actions{display:flex;gap:8px;margin-top:6px}
@media (max-width:720px){
.dc-top{height:auto;min-height:56px;flex-wrap:wrap;padding:8px 12px;row-gap:6px}
.dc-brand-text .dc-name{display:none}
.dc-tabs{order:3;width:100%;justify-content:space-between}
.dc-top-right{margin-left:auto}
.dc-top-right .dc-total{display:none}
.dc-entry,.dc-coding,.dc-import{padding:16px 14px 40px}
.dc-entry-head{flex-wrap:wrap;align-items:flex-start}
.dc-fields{grid-template-columns:1fr}
.dc-cards{grid-template-columns:1fr}
.dc-entry-foot{flex-direction:column;align-items:stretch;gap:10px}
.dc-entry-actions{justify-content:flex-end}
.dc-toolbar .dc-search{width:100%}
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

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => insertStyles(), 'demographic-coder: styles')
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
