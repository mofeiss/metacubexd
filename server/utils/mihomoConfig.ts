import { Buffer } from 'node:buffer'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'

export const MIHOMO_CONFIG_FILE_PATH = '/opt/mihomo/config.yaml'
export const MAX_MIHOMO_CONFIG_SIZE_BYTES = 2 * 1024 * 1024

export type MihomoConfigErrorCode =
  | 'NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'INVALID_CONTENT'
  | 'CONTENT_TOO_LARGE'
  | 'IO_ERROR'

export class MihomoConfigError extends Error {
  code: MihomoConfigErrorCode
  statusCode: number

  constructor(
    code: MihomoConfigErrorCode,
    statusCode: number,
    message: string,
  ) {
    super(message)
    this.name = 'MihomoConfigError'
    this.code = code
    this.statusCode = statusCode
  }
}

function mapNodeError(error: unknown, action: 'read' | 'write') {
  const err = error as NodeJS.ErrnoException

  if (err?.code === 'ENOENT') {
    return new MihomoConfigError(
      'NOT_FOUND',
      404,
      'Mihomo config file not found',
    )
  }

  if (err?.code === 'EACCES' || err?.code === 'EPERM') {
    return new MihomoConfigError(
      'PERMISSION_DENIED',
      403,
      `Permission denied while trying to ${action} Mihomo config file`,
    )
  }

  return new MihomoConfigError(
    'IO_ERROR',
    500,
    `Failed to ${action} Mihomo config file`,
  )
}

export async function readMihomoConfigFile(
  filePath: string = MIHOMO_CONFIG_FILE_PATH,
) {
  try {
    const [content, fileStat] = await Promise.all([
      readFile(filePath, 'utf8'),
      stat(filePath),
    ])
    return {
      content,
      mtimeMs: fileStat.mtimeMs,
    }
  } catch (error) {
    throw mapNodeError(error, 'read')
  }
}

export async function writeMihomoConfigFile(
  content: string,
  filePath: string = MIHOMO_CONFIG_FILE_PATH,
) {
  if (typeof content !== 'string') {
    throw new MihomoConfigError(
      'INVALID_CONTENT',
      400,
      '`content` must be a string',
    )
  }

  if (Buffer.byteLength(content, 'utf8') > MAX_MIHOMO_CONFIG_SIZE_BYTES) {
    throw new MihomoConfigError(
      'CONTENT_TOO_LARGE',
      413,
      `Config content exceeds ${MAX_MIHOMO_CONFIG_SIZE_BYTES} bytes`,
    )
  }

  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`

  try {
    await writeFile(tempPath, content, 'utf8')
    await rename(tempPath, filePath)
    const fileStat = await stat(filePath)

    return {
      mtimeMs: fileStat.mtimeMs,
    }
  } catch (error) {
    throw mapNodeError(error, 'write')
  } finally {
    await unlink(tempPath).catch(() => {
      /* no-op */
    })
  }
}
