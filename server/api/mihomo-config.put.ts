import { MihomoConfigError, writeMihomoConfigFile } from '../utils/mihomoConfig'

interface MihomoConfigWriteBody {
  content?: unknown
}

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<MihomoConfigWriteBody>(event)

    if (!body || typeof body.content !== 'string') {
      throw new MihomoConfigError(
        'INVALID_CONTENT',
        400,
        '`content` must be a string',
      )
    }

    const result = await writeMihomoConfigFile(body.content)
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof MihomoConfigError) {
      throw createError({
        statusCode: error.statusCode,
        statusMessage: error.message,
        data: { code: error.code },
      })
    }

    throw createError({
      statusCode: 500,
      statusMessage: 'Unexpected error while writing Mihomo config file',
    })
  }
})
