import { BbbPluginSdk, pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect, useState, useRef } from 'react';

import {
  PublicChatMessagesData,
  ChatMessage,
} from './types';
import { PUBLIC_CHAT_MESSAGES_SUBSCRIPTION } from './queries';

interface PluginWordCloudProps {
  pluginUuid: string;
}

const WORD_DISPLAY_DURATION_MS = 10000;
const MESSAGE_MAX_AGE_MS = 60000;

const extractWords = (text: string): string[] => {
  if (!text) return [];
  return text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(word => word.length > 0);
};

function PluginWordCloud({ pluginUuid }: PluginWordCloudProps):
React.ReactElement<PluginWordCloudProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  const [activeMessages, setActiveMessages] = useState<Array<{ id: string; content: React.ReactNode }>>([]);
  const [processedMessageIds, setProcessedMessageIds] = useState<string[]>([]);
  const messageTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  const subscriptionResponse = pluginApi.useCustomSubscription<PublicChatMessagesData>(
    PUBLIC_CHAT_MESSAGES_SUBSCRIPTION,
  );
  const userListBasicInf = pluginApi.useUsersBasicInfo();

  useEffect(() => {
    return () => {
      Object.values(messageTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    pluginLogger.info('+++++ sub response: ', subscriptionResponse.data?.chat_message_public);
    pluginLogger.info('+++++ userListBasicInf.data: ', userListBasicInf.data);

    // Check if the subscription data and user list data are available
    // Also check if the chat_message_public array exists and has elements
    if (subscriptionResponse.data?.chat_message_public &&
        Array.isArray(subscriptionResponse.data.chat_message_public) &&
        subscriptionResponse.data.chat_message_public.length > 0 &&
        userListBasicInf.data?.user) {

      // Access the *last* message from the array, assuming it's the newest
      const newMessage = subscriptionResponse.data.chat_message_public.at(-1);

      // Check if the extracted message object is valid
      if (!newMessage || !newMessage.messageId) {
        pluginLogger.debug('Subscription update without a valid message object:', newMessage);
        return;
      }

      // Destructure directly from the newMessage object
      const { messageId, message: messageText, senderId, createdAt, senderName: messageSenderName } = newMessage;
      const messageTime = new Date(createdAt).getTime(); // Assuming createdAt is a format Date can parse
      const messageCutoffTime = Date.now() - MESSAGE_MAX_AGE_MS;

      // Check if message is too old or already processed
      if (messageTime < messageCutoffTime || processedMessageIds.includes(messageId)) {
        pluginLogger.debug(`Skipping message ${messageId}: Old or already processed.`);
        return;
      }

      // Use the senderName directly from the message if available, otherwise look up
      const sender = userListBasicInf.data.user.find(u => u.userId === senderId);
      const senderName = messageSenderName || sender?.name || '???'; // Prioritize name from message

      pluginLogger.info('Processing new message event:', newMessage);
      pluginLogger.info(`Received message from ${senderName} (${senderId}): ${messageText}`);
      const words = extractWords(messageText); // Note: 'words' is extracted but not used currently. Keep or remove based on future needs.

      if (messageText) {
        const formattedMessage = (
          <>
            <strong>{senderName}:</strong> {messageText}
          </>
        );

        setActiveMessages((prevMessages) => [
          ...prevMessages,
          { id: messageId, content: formattedMessage },
        ]);

        setProcessedMessageIds(prevIds => [messageId, ...prevIds].slice(0, 5));

        if (messageTimeoutsRef.current[messageId]) {
          clearTimeout(messageTimeoutsRef.current[messageId]);
        }

        messageTimeoutsRef.current[messageId] = setTimeout(() => {
          removeMessage(messageId);
        }, WORD_DISPLAY_DURATION_MS);
      } else {
        pluginLogger.warn('Received chat message event without valid text:', newMessage);
      }
    }
    // Depend on the data part of the response/info objects for better performance
  }, [subscriptionResponse.data, userListBasicInf.data, processedMessageIds]);

  const removeMessage = (messageIdToRemove: string) => {
    setActiveMessages((prevMessages) =>
      prevMessages.filter((msg) => msg.id !== messageIdToRemove)
    );
    if (messageTimeoutsRef.current[messageIdToRemove]) {
      clearTimeout(messageTimeoutsRef.current[messageIdToRemove]);
      delete messageTimeoutsRef.current[messageIdToRemove];
    }
  };

  const messageListContainerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '70px',
    left: '140px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    zIndex: 1000,
    maxWidth: '40%',
    pointerEvents: 'none',
  };

  const messageBubbleStyle: React.CSSProperties = {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    padding: '8px 15px',
    borderRadius: '15px',
    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.3)',
    marginTop: '8px',
    fontSize: '1.2em',
    textAlign: 'left',
    pointerEvents: 'auto',
    width: 'fit-content',
    maxWidth: '100%',
  };

  return (
    <div style={messageListContainerStyle}>
      {activeMessages.map((msg) => (
        <div key={msg.id} style={messageBubbleStyle}>
          {msg.content}
        </div>
      ))}
    </div>
  );
}

export default PluginWordCloud;
