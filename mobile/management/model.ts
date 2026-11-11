import type { ConfigEntity, Query } from '../../api/types'
import type { MobileContext } from '../transport'
import type { RoleRule } from './api'

export function canManage(context: MobileContext | undefined, resource: string, action: string): boolean {
  return !!context?.permissions?.some(permission => (permission.id === resource || permission.id === '*')
    && (permission.actions.includes(action) || permission.actions.includes('*')))
}
export function pointQuery(name: string, categoryId: string, pageIndex = 0): Query {
  return { pageIndex, pageSize: 20, sorts: [{ name: 'createTime', order: 'desc' }, { name: 'id', order: 'asc' }], terms: [
    ...(name.trim() ? [{ column: 'name', termType: 'like', value: `%${name.trim()}%` }] : []),
    ...(categoryId ? [{ column: 'categoryId', termType: 'eq', value: categoryId }] : []),
  ] }
}
/** 只提交点位字段；编辑保留原始分类及NFC编码，不在本次H5中修改NFC。 */
export function pointPayload(value: ConfigEntity): ConfigEntity {
  return { id: value.id, name: value.name.trim(), code: value.code?.trim(), enabled: value.enabled,
    projectId: value.projectId, categoryId: value.categoryId, tagIds: [...(value.tagIds || [])],
    location: value.location?.trim(), description: value.description || '', nfcCode: value.nfcCode }
}
export function rulesValid(rules: RoleRule[]): boolean {
  return rules.every(rule => !!rule.levelId === !!rule.standardId) && new Set(rules.map(rule => rule.roleId)).size === rules.length
}
