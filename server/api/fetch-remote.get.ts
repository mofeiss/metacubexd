import { MAX_MIHOMO_CONFIG_SIZE_BYTES } from '../utils/mihomoConfig'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const url = query.url as string | undefined

  if (!url || typeof url !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required query parameter: url',
    })
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL must start with http:// or https://',
    })
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'metacubexd' },
    })

    if (!response.ok) {
      throw createError({
        statusCode: response.status,
        statusMessage: `Remote server responded with ${response.status}`,
      })
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_MIHOMO_CONFIG_SIZE_BYTES) {
      throw createError({
        statusCode: 413,
        statusMessage: `Remote file exceeds ${MAX_MIHOMO_CONFIG_SIZE_BYTES} bytes limit`,
      })
    }

    const content = await response.text()

    if (
      new TextEncoder().encode(content).length > MAX_MIHOMO_CONFIG_SIZE_BYTES
    ) {
      throw createError({
        statusCode: 413,
        statusMessage: `Remote file exceeds ${MAX_MIHOMO_CONFIG_SIZE_BYTES} bytes limit`,
      })
    }

    return { content }
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode) {
      throw error
    }

    throw createError({
      statusCode: 502,
      statusMessage: `Failed to fetch from remote URL: ${(error as Error).message}`,
    })
  }
})
