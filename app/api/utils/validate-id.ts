// dify-client joins these IDs into upstream URLs without encoding, so '..' or '/'
// would redirect the API-key-bearing request. Dify itself issues UUIDs.
const ID_PATTERN = /^[\w-]{1,64}$/

export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

export const invalidIdResponse = () =>
  Response.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 })
