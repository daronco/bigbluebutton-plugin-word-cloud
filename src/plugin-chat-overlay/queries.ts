
export const PUBLIC_CHAT_MESSAGES_SUBSCRIPTION = `
  subscription publicChatMessages($meetingId: String!) {
    publicChatMessages(meetingId: $meetingId) {
      message {
        messageId
        message
        senderId
        senderName
        createdAt
      }
    }
  }
`;
