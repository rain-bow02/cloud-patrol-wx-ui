import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import jsQR from 'jsqr'
import { matchScannedTasks, scannedPointId } from '../mobile/scan/match.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/point-qr-pixels.json', import.meta.url), 'utf8'))
const gray = inflateSync(Buffer.from(fixture.grayDeflate, 'base64'))
function pixels(inverted = false, rotated = false) {
  const data = new Uint8ClampedArray(gray.length * 4), n = fixture.width
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const offset = (y * n + x) * 4, value = gray[rotated ? (n - x - 1) * n + y : y * n + x]
    data.fill(inverted ? 255 - value : value, offset, offset + 3); data[offset + 3] = 255
  }
  return { data, width: n, height: n }
}
const row = (id, changes = {}) => ({ executable: true, reason: '', task: {
  id, pointId: fixture.value, startTime: 100, endTime: 200, requiredCount: 2, completedCount: 0, ...changes,
} })
test('QR from real PC download decodes in normal, inverted and rotated images', () => {
  for (const variant of [[false, false], [true, false], [false, true]]) {
    const image = pixels(...variant)
    assert.equal(jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data, fixture.value)
  }
})
test('scan preserves multiple posts, exact identity, current time and authoritative eligibility', () => {
  const a = row('a'), b = row('b'), denied = { ...row('denied'), executable: false }
  const rows = [a, b, a, denied, row('completed', { completedCount: 2 }), row('future', { startTime: 151 }),
    row('ended', { endTime: 150 }), row('other', { pointId: 'other-point' })]
  assert.deepEqual(matchScannedTasks(` ${fixture.value} `, rows, 150).map(r => r.task.id), ['a', 'b'])
  assert.deepEqual(matchScannedTasks('missing', rows, 150), [])
  assert.equal(matchScannedTasks(fixture.value, [a], 100).length, 1)
  assert.equal(matchScannedTasks(fixture.value, [a], 200).length, 0)
  for (const value of ['', 'https://example.com/' + fixture.value, '{"pointId":"x"}', '../x', 'x'.repeat(129)])
    assert.throws(() => scannedPointId(value), /Mobile.scanInvalid/)
})
