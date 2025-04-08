import { BbbPluginSdk, pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect, useState, useRef } from 'react';

import {
  PublicChatMessagesData,
  ChatMessage,
} from './types';
import { PUBLIC_CHAT_MESSAGES_SUBSCRIPTION } from './queries';

interface PluginChatOverlayProps {
  pluginUuid: string;
}

const WORD_DISPLAY_DURATION_MS = 10000;
const MESSAGE_MAX_AGE_MS = 60000;

const extractWords = (text: string): string[] => {
  if (!text) return [];
  return text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(word => word.length > 0);
};

function PluginChatOverlay(
  { pluginUuid }: PluginChatOverlayProps,
): React.ReactElement<PluginChatOverlayProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  const meetingInfoGraphqlResponse = pluginApi.useMeeting();

  const response = pluginApi.useLoadedChatMessages();
  const userListBasicInf = pluginApi.useUsersBasicInfo();

  const [displayedWords, setDisplayedWords] = useState<string[]>([]);
  const [activeMessages, setActiveMessages] = useState<Array<{ id: string; content: React.ReactNode }>>([]);
  const [processedMessageIds, setProcessedMessageIds] = useState<string[]>([]);
  const messageTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    return () => {
      Object.values(messageTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  const removeMessage = (messageIdToRemove: string) => {
    setActiveMessages((prevMessages) =>
      prevMessages.filter((msg) => msg.id !== messageIdToRemove)
    );
    if (messageTimeoutsRef.current[messageIdToRemove]) {
      clearTimeout(messageTimeoutsRef.current[messageIdToRemove]);
      delete messageTimeoutsRef.current[messageIdToRemove];
    }
  };

  useEffect(() => {
    if (response.data) {
      const latestMessageEvents = response.data;

      const messageCutoffTime = Date.now() - MESSAGE_MAX_AGE_MS;

      latestMessageEvents.forEach(event => {
        if (event?.message && event.messageId && event.createdAt) {
          if (new Date(event.createdAt).getTime() < messageCutoffTime || processedMessageIds.includes(event.messageId)) {
            return;
          }

          pluginLogger.info('Processing recent message event metadata:', event.messageMetadata);

          const messageText = event.message;
          const senderUserId = event.senderUserId;
          const messageId = event.messageId;

          const sender = userListBasicInf.data?.user?.find(u => u.userId === senderUserId);
          const senderName = sender?.name ?? '???';

          pluginLogger.info(`Received message from ${senderName} (${senderUserId}): ${messageText}`);
          const words = extractWords(messageText);

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
          }
        } else {
          pluginLogger.warn('Received chat message event without valid message/ID/createdAt:', event);
        }
      });
    }
  }, [response, userListBasicInf]);

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

export default PluginChatOverlay;
