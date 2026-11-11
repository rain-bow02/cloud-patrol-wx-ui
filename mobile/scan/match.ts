import type { MobileTask } from '../model'

/** 二维码只携带点位主键，不解析 URL、身份或硬件 NFC 编码，也不授予任务权限。 */
export function scannedPointId(raw: string): string {
  const id = raw.trim()
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error('Mobile.scanInvalid')
  return id
}

/** 与旧员工端一致：只匹配当前可提交时段，保留同一点位的全部岗位任务供选择。 */
export function matchScannedTasks(raw: string, rows: MobileTask[], now: number): MobileTask[] {
  const id = scannedPointId(raw), seen = new Set<string>()
  return rows.filter(row => {
    const task = row.task
    if (task.pointId !== id || !row.executable || now < task.startTime || now >= task.endTime
      || task.completedCount >= task.requiredCount || seen.has(task.id)) return false
    seen.add(task.id)
    return true
  })
}
