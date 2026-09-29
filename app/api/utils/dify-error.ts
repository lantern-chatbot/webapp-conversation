// Error responses for failed Dify calls. An Axios error carries the upstream
// URL and the request config (including the API key header), and its message
// can include internal addresses, so none of it is forwarded to the browser.

const UPSTREAM_FAILURE_STATUS = 502
const INTERNAL_FAILURE_STATUS = 500

interface DifyErrorLike {
  isAxiosError?: unknown
  response?: {
    status?: unknown
    data?: { destroy?: unknown } | null
  }
}

const asErrorLike = (error: unknown): DifyErrorLike | undefined =>
  typeof error === 'object' && error !== null ? error as DifyErrorLike : undefined

export const difyErrorStatus = (error: unknown): number => {
  const errorLike = asErrorLike(error)
  const status = errorLike?.response?.status
  // A Dify 401 means this server's API key was rejected, not the browser's
  // session. The page's fetch wrapper never settles on 401, so do not forward it.
  if (status === 401) { return UPSTREAM_FAILURE_STATUS }
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599) { return status }
  // No upstream response (connection refused, timeout, DNS) means the gateway failed.
  return errorLike?.isAxiosError === true ? UPSTREAM_FAILURE_STATUS : INTERNAL_FAILURE_STATUS
}

// The SDK requests some endpoints as streams, and Axios keeps the stream even
// for error responses. Destroy it so the upstream connection is released.
export const discardDifyErrorBody = (error: unknown) => {
  const data = asErrorLike(error)?.response?.data
  if (data && typeof data.destroy === 'function') { data.destroy() }
}

export const difyErrorResponse = (error: unknown, message: string) => {
  discardDifyErrorBody(error)
  return Response.json({ message }, { status: difyErrorStatus(error) })
}

export const invalidRequestResponse = () =>
  Response.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 })
