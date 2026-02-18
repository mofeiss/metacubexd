import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_MIHOMO_CONFIG_SIZE_BYTES,
  readMihomoConfigFile,
  writeMihomoConfigFile,
} from '../mihomoConfig'

describe('server/utils/mihomoConfig', () => {
  const tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
    )
    tempDirs.length = 0
  })

  async function createTempConfigFile(content: string = '') {
    const dir = await mkdtemp(join(tmpdir(), 'mihomo-config-test-'))
    tempDirs.push(dir)

    const filePath = join(dir, 'config.yaml')
    await writeFile(filePath, content, 'utf8')

    return filePath
  }

  it('reads config content and mtime', async () => {
    const filePath = await createTempConfigFile('mixed-port: 7890\n')

    const result = await readMihomoConfigFile(filePath)

    expect(result.content).toBe('mixed-port: 7890\n')
    expect(result.mtimeMs).toBeGreaterThan(0)
  })

  it('writes config content atomically and updates mtime', async () => {
    const filePath = await createTempConfigFile('port: 7890\n')
    const before = await stat(filePath)

    await writeMihomoConfigFile('port: 7891\n', filePath)
    const content = await readFile(filePath, 'utf8')
    const after = await stat(filePath)

    expect(content).toBe('port: 7891\n')
    expect(after.mtimeMs).toBeGreaterThanOrEqual(before.mtimeMs)
  })

  it('rejects config content larger than size limit', async () => {
    const filePath = await createTempConfigFile('')
    const tooLargeContent = 'a'.repeat(MAX_MIHOMO_CONFIG_SIZE_BYTES + 1)

    await expect(
      writeMihomoConfigFile(tooLargeContent, filePath),
    ).rejects.toMatchObject({
      code: 'CONTENT_TOO_LARGE',
      statusCode: 413,
    })
  })
})
