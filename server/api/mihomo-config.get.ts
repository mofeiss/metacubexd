import { MihomoConfigError, readMihomoConfigFile } from '../utils/mihomoConfig'

export default defineEventHandler(async () => {
  try {
    return await readMihomoConfigFile()
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
      statusMessage: 'Unexpected error while reading Mihomo config file',
    })
  }
})
