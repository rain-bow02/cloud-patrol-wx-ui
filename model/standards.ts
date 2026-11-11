import type { CheckItem, ItemType, EnumValue } from '../api/types'

export const itemTypes: ItemType[] = ['number', 'text', 'choice', 'image']
export const enumValue = <T extends string>(value: T | EnumValue<T> | null | undefined): T | undefined =>
  value == null ? undefined : typeof value === 'object' ? value.value : value
export const itemType = (item: CheckItem): ItemType => enumValue(item.type) ?? 'choice'

/** 已部署的简单标准没有类型；在编辑副本中补全，不改动原对象或历史快照。 */
export function normalizeItem(item: CheckItem): CheckItem {
  return { ...item, type: itemType(item), options: [...(item.options ?? [])],
    qualifiedOptions: itemType(item) === 'choice' ? (item.options ?? []).slice(0, 1) : [], photoRequired: item.photoRequired ?? false }
}

/** 切换类型时移除不再生效的判定字段，避免隐藏规则继续影响保存和执行。 */
export function changeItemType(item: CheckItem, type: ItemType): CheckItem {
  return { ...normalizeItem(item), type, options: type === 'choice' ? item.options : [],
    qualifiedOptions: [], lowerLimit: null, upperLimit: null }
}

export function standardError(items: CheckItem[]): string | undefined {
  if (!items.length || items.length > 100) return 'Patrol.standardItemsRequired'
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.id || !item.title.trim() || item.title.length > 200) return 'Patrol.itemTitleRequired'
    if (ids.has(item.id)) return 'Patrol.duplicateItems'
    ids.add(item.id)
    const options = item.options ?? [], qualified = item.qualifiedOptions ?? []
    if (itemType(item) === 'choice') {
      if (!options.length || options.length > 50 || options.some(value => !value.trim() || value.length > 128)
        || new Set(options).size !== options.length || new Set(qualified).size !== qualified.length
        || qualified.some(value => !options.includes(value))) return 'Patrol.invalidOptions'
    } else if (options.length || qualified.length) return 'Patrol.invalidOptions'
    const lower = item.lowerLimit, upper = item.upperLimit
    const limits = [lower, upper].filter(value => value !== null && value !== undefined)
    if (limits.length && itemType(item) !== 'number') return 'Patrol.invalidLimits'
    if (limits.some(value => !/^[+-]?\d{1,18}(\.\d{1,6})?$/.test(String(value)))) return 'Patrol.invalidLimits'
    // BigInt 对齐后比较，避免 18 位数值在浏览器 Number 中丢失精度。
    if (lower != null && upper != null && compareDecimal(String(lower), String(upper)) > 0)
      return 'Patrol.invalidLimits'
  }
}

/** 检查结果展示实际答案，仅按当时的题目快照标红异常，不读取旧版整体判定。 */
export function answerIsAbnormal(item: CheckItem, answer?: { value?: string | null }): boolean {
  const value = answer?.value
  if (value == null || !value.trim()) return false
  if (itemType(item) === 'choice') return !!item.options?.length && value !== item.options[0]
  if (itemType(item) !== 'number' || !/^[+-]?\d+(\.\d+)?$/.test(value)) return false
  return (item.lowerLimit != null && compareDecimal(value, String(item.lowerLimit)) < 0)
    || (item.upperLimit != null && compareDecimal(value, String(item.upperLimit)) > 0)
}

/** 对齐小数位比较，保证大数和边界附近的小数不被浮点舍入误判。 */
function compareDecimal(left: string, right: string): number {
  const scale = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0)
  const units = (value: string) => {
    const [integer, fraction = ''] = value.replace(/^[+-]/, '').split('.')
    const result = BigInt(integer + fraction.padEnd(scale, '0'))
    return value.startsWith('-') ? -result : result
  }
  const a = units(left), b = units(right)
  return a < b ? -1 : a > b ? 1 : 0
}
