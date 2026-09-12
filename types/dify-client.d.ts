import 'dify-client'

// dify-client 2.3.2 implements auto_generate but omits it from index.d.ts.
declare module 'dify-client' {
  interface ChatClient {
    // eslint-disable-next-line ts/method-signature-style -- Must merge with the SDK class method overload.
    renameConversation(
      conversationId: string,
      name: string,
      user: Parameters<ChatClient['getConversations']>[0],
      autoGenerate?: boolean,
    ): ReturnType<ChatClient['sendRequest']>
  }
}
