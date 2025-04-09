export interface ChatMessage {
  messageId: string;
  message: string;
  senderId: string;
  senderName: string;
  createdAt: number;
}

export interface PublicChatMessagesData {
  // The top-level field matches the subscription name
  // and contains an array of ChatMessage objects
  chat_message_public: ChatMessage[];
}

export interface PluginWordCloudProps {
  pluginUuid: string;
}
