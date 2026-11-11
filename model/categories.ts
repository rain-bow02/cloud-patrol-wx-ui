import type { ConfigEntity } from '../api/types'
export interface CategoryNode { key: string; value: string; title: string; disabled: boolean; children: CategoryNode[] }
/** 分类接口返回授权内平铺数据；不可见父级作为根显示，不补查权限外节点。 */
export function categoryTree(rows: ConfigEntity[], excludedId?: string): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>()
  const disabled = new Set(categoryDescendants(rows, excludedId))
  rows.forEach(row => { if (row.id) nodes.set(row.id, { key: row.id, value: row.id, title: row.name, disabled: disabled.has(row.id), children: [] }) })
  const roots: CategoryNode[] = []
  rows.forEach(row => {
    const node = row.id ? nodes.get(row.id) : undefined
    if (!node) return
    const parent = row.parentId ? nodes.get(row.parentId) : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  })
  return roots
}
/** 自身与后代同时用于父级禁选；点位分类树使用同一集合表达包含下级。 */
export function categoryDescendants(rows: ConfigEntity[], id?: string): string[] {
  if (!id) return []
  const ids = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    rows.forEach(row => {
      if (row.id && row.parentId && ids.has(row.parentId) && !ids.has(row.id)) { ids.add(row.id); changed = true }
    })
  }
  return [...ids]
}
/** 搜索保留匹配节点的祖先及其子树，避免命中叶节点后失去层级位置。 */
export function filterCategoryTree(nodes: CategoryNode[], keyword: string): CategoryNode[] {
  const search = keyword.trim().toLocaleLowerCase()
  if (!search) return nodes
  return nodes.flatMap(node => {
    if (node.title.toLocaleLowerCase().includes(search)) return [node]
    const children = filterCategoryTree(node.children, keyword)
    return children.length ? [{ ...node, children }] : []
  })
}

export const MAX_CATEGORY_DEPTH = 3
/** 按完整授权树定位真实层级；父级不可见时不将它误当一级供新增下级。 */
export function categoryDepth(rows: ConfigEntity[], id?: string): number {
  const byId = new Map(rows.map(row => [row.id, row]))
  const visited = new Set<string>()
  let depth = 0, current = id
  while (current) {
    const row = byId.get(current)
    if (!row || visited.has(current)) return Infinity
    visited.add(current); depth++; current = row.parentId
  }
  return depth
}

/** 移动分类时连同子树计算三级限制；原父级保留可选，历史深层节点仍可正常编辑。 */
export function categoryParentIds(rows: ConfigEntity[], current?: ConfigEntity): string[] {
  const subtree = categoryDescendants(rows, current?.id)
  const original = rows.find(row => row.id === current?.id)
  const depths = subtree.map(id => categoryDepth(rows, id) - categoryDepth(rows, current?.id) + 1)
  const height = depths.length ? Math.max(...depths) : 1
  return rows.filter(row => row.id && !subtree.includes(row.id)
    && (!current?.id || row.projectId === current.projectId)
    && (row.id === original?.parentId || categoryDepth(rows, row.id) + height <= MAX_CATEGORY_DEPTH))
    .map(row => row.id!)
}
