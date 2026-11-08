// Shared, dependency-free snapshot contract. IDs are opaque strings.
export const SNAPSHOT_VERSION = 2

export function validateDataset(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.columns) || !Array.isArray(input.rows)) throw new Error('数据集需要 columns 与 rows 数组')
  const dataset = JSON.parse(JSON.stringify(input))
  const keys = new Set()
  for (const column of dataset.columns) {
    if (!column || typeof column.key !== 'string' || !column.key || column.key === 'id' || keys.has(column.key)) throw new Error('变量 key 为空、重复或使用了保留字段 id')
    keys.add(column.key)
    if (!column.coding) column.coding = { enabled: false, map: {}, missing: '' }
    if (typeof column.coding !== 'object' || !column.coding.map || typeof column.coding.map !== 'object' || Array.isArray(column.coding.map)) throw new Error('变量编码映射无效')
  }
  const ids = new Set()
  for (const row of dataset.rows) {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) throw new Error('每行需要非空字符串编号；数字编号请先转为文本')
    if (ids.has(row.id)) throw new Error('重复被试编号：' + row.id)
    ids.add(row.id)
    if (!row.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new Error('行缺少原始 values 对象：' + row.id)
    if (Object.hasOwn(row.values, 'id')) throw new Error('原始值不能使用保留字段 id')
    for (const column of dataset.columns) {
      const value = row.values[column.key]
      if (column.kind === 'number' && value != null && String(value).trim() !== '' && !Number.isFinite(Number(value))) throw new Error('编号 ' + row.id + ' 的「' + column.label + '」需要有效数值；原文保留在草稿')
      if (column.required && (value == null || String(value).trim() === '')) throw new Error('编号 ' + row.id + ' 的「' + column.label + '」为必填项')
      if (column.kind === 'number' && value != null && String(value).trim() !== '') {
        if (Number.isFinite(column.min) && Number(value) < column.min) throw new Error('数值低于下限：' + column.label)
        if (Number.isFinite(column.max) && Number(value) > column.max) throw new Error('数值高于上限：' + column.label)
      }
    }
  }
  return dataset
}

export function legacyDataset(document) {
  if (!document || !Array.isArray(document.columns) || !Array.isArray(document.rows)) throw new Error('磁盘人口学文件结构无效')
  return validateDataset({
    name: document.name || '人口学数据',
    columns: document.columns.map(column => ({ ...column, coding: column.coding ? { enabled: column.coding.enabled !== false, ...column.coding, map: column.coding.map || {} } : { enabled: false, map: {}, missing: '' } })),
    rows: document.rows.map(row => {
      const { id, ...values } = row
      return { id: String(id ?? ''), values }
    })
  })
}

export function mirrorDocument(dataset, metadata) {
  return {
    schemaVersion: SNAPSHOT_VERSION,
    ...metadata,
    name: dataset.name,
    columns: dataset.columns,
    rows: dataset.rows.map(row => ({ ...row.values, id: row.id })),
    dataset
  }
}
