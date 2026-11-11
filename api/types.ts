export type Resource = 'categories' | 'points' | 'standards' | 'roles' | 'rosters' | 'plans' | 'levels' | 'tags' | 'warnings'
export interface EnumValue<T extends string = string> {
  value: T
  text: string
}
export type RosterPolicy = 'optional' | 'required'
export interface RuleWindow {
  startMinute: number
  endMinute: number
  intervalMinutes: number
  requiredCount: number
  cooldownMinutes?: number | null
  frequencyUnit?: '1' | '2' | '3' | null
  cooldownUnit?: '1' | '2' | '3' | null
}
export interface PatrolRule {
  weekly: Record<string, RuleWindow[]>
  dates: Record<string, RuleWindow[]>
  cooldownMinutes: number
}
export interface CheckItem {
  id: string
  title: string
  required: boolean
  options: string[]
  type?: ItemType | EnumValue<ItemType> | null
  lowerLimit?: string | number | null
  upperLimit?: string | number | null
  referenceText?: string
  qualifiedOptions?: string[]
  photoRequired?: boolean
  exampleFileId?: string | null
}
export type ItemType = 'number' | 'text' | 'choice' | 'image'
export type CheckResult = 'pass' | 'fail' | 'not_evaluated'
export interface AttachmentReceipt { id: string; name: string; mediaType: string; length: number }
export interface ConfigEntity {
  projectId?: string
  projectName?: string
  id?: string
  name: string
  enabled: boolean
  description?: string
  createTime?: number
  modifyTime?: number
  creatorName?: string | null
  modifierName?: string | null
  parentId?: string
  code?: string
  categoryId?: string
  categoryIds?: string[]
  assignedRoleIds?: string[]
  tagIds?: string[]
  levelId?: string
  shiftName?: string
  userName?: string
  rest?: boolean
  triggerParentCode?: string
  triggerChildCode?: string
  warningCode?: string
  colorHex?: string
  location?: string
  nfcCode?: string
  items?: CheckItem[]
  userIds?: string[]
  roleId?: string
  businessDate?: string
  userId?: string
  startTime?: number
  endTime?: number
  pointId?: string
  standardId?: string
  effectiveFrom?: string
  effectiveTo?: string
  rosterPolicy?: RosterPolicy | EnumValue<RosterPolicy>
  rule?: PatrolRule
  ruleSummary?: string[]
}
export interface TaskGroup {
  /** 空串表示全员任务，非平台角色 ID。 */
  roleId: string
  projectId?: string
  projectName?: string
  id: string
  planId: string
  name: string
  pointId: string
  pointName: string
  roleName: string
  belongDate: string
  ruleVersion: string
  periodCount: number
  categoryId?: string
  categoryName?: string
  levelId?: string
  levelName?: string
  completedCount: number
  lastExecutionTime?: number
  requiredCount: number
  startTime: number
  endTime: number
}
export interface Task {
  /** 沿生成快照区分指定角色与全员任务。 */
  roleId: string
  projectId?: string
  projectName?: string
  taskGroupId?: string
  belongDate?: string
  periodNo?: number
  ruleVersion?: string
  id: string
  name: string
  planId: string
  pointId: string
  pointName: string
  roleName: string
  businessDate: string
  startTime: number
  endTime: number
  requiredCount: number
  completedCount: number
  lastExecutionTime?: number
  levelName?: string
  cooldownMinutes?: number
  categoryId?: string
  categoryName?: string
  standardSnapshot: CheckItem[]
}
export interface Answer {
  itemId: string
  value?: string | null
  attachmentId?: string | null
}
export type NetworkStatus = 'online' | 'offline'
/** 客户端报告的采集信息；历史记录允许缺失，不回填成服务器接收时间。 */
export interface CollectionMetadata { collectedTime?: number | null; networkStatus?: NetworkStatus | null }
export interface Execution {
  projectId?: string
  projectName?: string
  periodStartTime?: number
  periodEndTime?: number
  categoryId?: string
  categoryName?: string
  levelId?: string
  levelName?: string
  taskGroupId?: string
  belongDate?: string
  periodNo?: number
  ruleVersion?: string
  id: string
  taskId: string
  planId: string
  pointName: string
  userName: string
  collectedTime?: number | null
  networkStatus?: NetworkStatus | EnumValue<NetworkStatus> | null
  receiveTime: number
  remark?: string
  answers: Answer[]
  standardSnapshot: CheckItem[]
  result?: CheckResult | EnumValue<CheckResult> | null
  itemResults?: { itemId: string; result: CheckResult | EnumValue<CheckResult> }[]
}
export interface Person {
  id: string
  name: string
}
export interface Term {
  column?: string
  termType?: string
  value?: unknown
  type?: string
  terms?: Term[]
}
export interface Query {
  pageIndex?: number
  pageSize?: number
  paging?: boolean
  terms?: Term[]
  sorts?: { name: string; order: string }[]
}
export interface Page<T> {
  data: T[]
  total: number
  pageIndex: number
  pageSize: number
}
