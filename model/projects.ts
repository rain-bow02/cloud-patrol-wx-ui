import type { EnumValue } from '../api/types'
export interface OrganizationNode {
  id: string; name: string; parentId?: string
  organizationType?: 'project' | 'external' | EnumValue<'project' | 'external'> | null
  children?: OrganizationNode[]
}
export interface ProjectTreeNode {
  value: string; title: string; disabled: boolean; selectable: boolean; children: ProjectTreeNode[]
}
/** 仅保留服务端返回节点，不补查祖先；非项目置灰且不可选，仍保留展开层级。 */
export function projectTree(nodes: OrganizationNode[]): ProjectTreeNode[] {
  return nodes.map(node => {
    const type = typeof node.organizationType === 'object' ? node.organizationType?.value : node.organizationType
    const disabled = type !== 'project'
    return { value: node.id, title: node.name, disabled, selectable: !disabled, children: projectTree(node.children ?? []) }
  })
}
export function findOrganization(nodes: OrganizationNode[], id?: string): OrganizationNode | undefined {
  if (!id) return undefined
  for (const node of nodes) {
    if (node.id === id) return node
    const found = findOrganization(node.children ?? [], id)
    if (found) return found
  }
}
