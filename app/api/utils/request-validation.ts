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
const MAX_URL_LENGTH = 2048
const RATINGS = new Set(['like', 'dislike', null])
const FILE_TYPES = new Set(['image', 'document', 'audio', 'video', 'custom'])

// Which file types and transfer methods are accepted is governed by the Dify app
// settings. Here only the shape the chat UI produces is allowed through.
type FileReference
  = | { type: string, transfer_method: 'local_file', upload_file_id: string }
    | { type: string, transfer_method: 'remote_url', url: string }
type InputValue = string | number | boolean | FileReference | FileReference[]

export interface ChatMessageBody {
  query: string
  inputs: Record<string, InputValue>
  conversationId?: string
  files?: FileReference[]
}

export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && ID_PATTERN.test(value)

export const badRequestResponse = () =>
  Response.json({ message: 'リクエストの形式が正しくありません。' }, { status: 400 })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isHttpUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) { return false }
  try { return ['http:', 'https:'].includes(new URL(value).protocol) }
  catch { return false }
}

const parseFile = (value: unknown): FileReference | undefined => {
  if (!isPlainObject(value) || typeof value.type !== 'string' || !FILE_TYPES.has(value.type)) { return undefined }
  if (value.transfer_method === 'local_file' && isValidId(value.upload_file_id)) {
    return { type: value.type, transfer_method: 'local_file', upload_file_id: value.upload_file_id }
  }
  if (value.transfer_method === 'remote_url' && isHttpUrl(value.url)) {
    return { type: value.type, transfer_method: 'remote_url', url: value.url }
  }
  return undefined
}

const parseFileList = (value: unknown) => {
  if (!Array.isArray(value) || value.length > MAX_FILES) { return undefined }
  const files = value.map(parseFile)
  return files.every(file => file !== undefined) ? files as FileReference[] : undefined
}

const parseInputValue = (value: unknown): InputValue | undefined => {
  if (typeof value === 'string') { return value.length <= MAX_INPUT_LENGTH ? value : undefined }
  if (typeof value === 'boolean') { return value }
  if (typeof value === 'number') { return Number.isFinite(value) ? value : undefined }
  // File and file-list prompt variables from the welcome form.
  return Array.isArray(value) ? parseFileList(value) : parseFile(value)
}

const parseInputs = (value: unknown) => {
  if (value === undefined || value === null) { return {} }
  if (!isPlainObject(value)) { return undefined }
  const entries = Object.entries(value)
  if (entries.length > MAX_INPUTS) { return undefined }
  const inputs: Record<string, InputValue> = {}
  for (const [key, item] of entries) {
    if (!INPUT_KEY_PATTERN.test(key)) { return undefined }
    const parsed = parseInputValue(item)
    if (parsed === undefined) { return undefined }
    inputs[key] = parsed
  }
  return inputs
}

const parseFiles = (value: unknown) => {
  if (value === undefined || value === null) { return { files: undefined } }
  const files = parseFileList(value)
  if (!files) { return undefined }
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
