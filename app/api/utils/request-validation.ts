// dify-client joins these IDs into upstream URLs without encoding, so '..' or '/'
// would redirect the API-key-bearing request. Dify itself issues UUIDs.
const ID_PATTERN = /^[\w-]{1,64}$/
// Dify variable names: letters, digits and underscores, not starting with a digit.
const INPUT_KEY_PATTERN = /^[A-Z_a-z]\w{0,63}$/

export const MAX_QUERY_LENGTH = 4000
const MAX_INPUTS = 20
const MAX_INPUT_LENGTH = 2000
const MAX_FILES = 10
const MAX_NAME_LENGTH = 100
const RATINGS = new Set(['like', 'dislike', null])

type InputValue = string | number | boolean
interface UploadedImage { type: 'image', transfer_method: 'local_file', upload_file_id: string }

export interface ChatMessageBody {
  query: string
  inputs: Record<string, InputValue>
  conversationId?: string
  files?: UploadedImage[]
}

export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

export const badRequestResponse = () =>
  Response.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const parseInputs = (value: unknown) => {
  if (value === undefined || value === null) { return {} }
  if (!isPlainObject(value)) { return undefined }
  const entries = Object.entries(value)
  if (entries.length > MAX_INPUTS) { return undefined }
  const inputs: Record<string, InputValue> = {}
  for (const [key, item] of entries) {
    if (!INPUT_KEY_PATTERN.test(key)) { return undefined }
    const allowed = (typeof item === 'string' && item.length <= MAX_INPUT_LENGTH)
      || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))
    if (!allowed) { return undefined }
    inputs[key] = item as InputValue
  }
  return inputs
}

// Only images already uploaded through /api/file-upload. A remote_url would make
// Dify fetch an arbitrary address on the user's behalf.
const parseFiles = (value: unknown) => {
  if (value === undefined || value === null) { return { files: undefined } }
  if (!Array.isArray(value) || value.length > MAX_FILES) { return undefined }
  const files: UploadedImage[] = []
  for (const item of value) {
    if (!isPlainObject(item) || item.type !== 'image' || item.transfer_method !== 'local_file' || !isValidId(item.upload_file_id)) { return undefined }
    files.push({ type: 'image', transfer_method: 'local_file', upload_file_id: item.upload_file_id })
  }
  return { files: files.length > 0 ? files : undefined }
}

export const parseChatMessageBody = (body: unknown): ChatMessageBody | undefined => {
  if (!isPlainObject(body)) { return undefined }
  const { query, conversation_id: conversationId } = body
  if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) { return undefined }
  const inputs = parseInputs(body.inputs)
  if (!inputs) { return undefined }
  const parsedFiles = parseFiles(body.files)
  if (!parsedFiles) { return undefined }
  const isNewConversation = conversationId === undefined || conversationId === null || conversationId === ''
  if (!isNewConversation && !isValidId(conversationId)) { return undefined }
  return {
    query,
    inputs,
    conversationId: isNewConversation ? undefined : conversationId as string,
    files: parsedFiles.files,
  }
}

export const parseRenameBody = (body: unknown) => {
  if (!isPlainObject(body)) { return undefined }
  const { auto_generate: autoGenerate, name } = body
  if (autoGenerate !== undefined && typeof autoGenerate !== 'boolean') { return undefined }
  if (name !== undefined && (typeof name !== 'string' || name.length > MAX_NAME_LENGTH)) { return undefined }
  if (autoGenerate !== true && !(typeof name === 'string' && name.trim())) { return undefined }
  return { autoGenerate: autoGenerate === true, name: typeof name === 'string' ? name : undefined }
}

export const parseFeedbackBody = (body: unknown) => {
  if (!isPlainObject(body) || !RATINGS.has(body.rating as string | null)) { return undefined }
  return { rating: body.rating as 'like' | 'dislike' | null }
}
