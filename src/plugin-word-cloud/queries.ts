export const PUBLIC_CHAT_MESSAGES_SUBSCRIPTION = `
  subscription publicChatMessages { # Removed $meetingId variable definition
    chat_message_public { # Removed (meetingId: $meetingId) argument
      # Fields directly under chat_message_public
      messageId
      message
      senderId
      senderName
      createdAt
    }
  }
`;
