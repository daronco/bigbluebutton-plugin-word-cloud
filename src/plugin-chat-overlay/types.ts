// // Defines the structure for a single user's information from the custom query
// export interface UserMoreInformation {
//   userId: string;
//   name: string;
//   role: 'MODERATOR' | 'VIEWER'; // Add other roles if applicable
//   // Add other fields corresponding to the query here
// }

// // Defines the structure of the data returned by the usersMoreInformation subscription
// export interface UsersMoreInformationData {
//   usersMoreInformation: UserMoreInformation[];
// }

// Removed PickedUser as it's no longer used by this plugin.

// Structure for a single chat message within the subscription data, aligned with queries.ts
export interface ChatMessage {
  messageId: string;
  message: string; // The actual text content
  senderId: string;
  senderName: string;
  createdAt: number; // Assuming this is a Unix timestamp or similar numeric representation
}

// Structure for the data returned by the publicChatMessages subscription
// Assumes the subscription pushes events where each event contains one message object.
export interface PublicChatMessagesData {
  publicChatMessages: {
    message: ChatMessage;
    // Add other potential fields from the subscription event wrapper if needed
  }[];
}
