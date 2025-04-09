import { BbbPluginSdk, pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect, useState } from 'react'; // Removed useRef

import {
  PublicChatMessagesData,
  ChatMessage,
} from './types';
import { PUBLIC_CHAT_MESSAGES_SUBSCRIPTION } from './queries';

interface PluginWordCloudProps {
  pluginUuid: string;
}

// Removed WORD_DISPLAY_DURATION_MS and MESSAGE_MAX_AGE_MS

const extractWords = (text: string): string[] => {
  if (!text) return [];
  return text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(word => word.length > 0);
};

function PluginWordCloud({ pluginUuid }: PluginWordCloudProps):
React.ReactElement<PluginWordCloudProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  // State to store word counts
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  // State to keep track of processed message IDs to avoid duplicates
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());

  const subscriptionResponse = pluginApi.useCustomSubscription<PublicChatMessagesData>(
    PUBLIC_CHAT_MESSAGES_SUBSCRIPTION,
  );
  // Removed userListBasicInf hook as sender info is not needed for word counts

  // Removed useEffect for clearing timeouts

  useEffect(() => {
    pluginLogger.debug('Subscription data received:', subscriptionResponse.data);

    // Check if the subscription data is available and contains messages
    if (subscriptionResponse.data?.chat_message_public &&
        Array.isArray(subscriptionResponse.data.chat_message_public)) {

      const newMessages = subscriptionResponse.data.chat_message_public;
      let updated = false; // Flag to track if wordCounts was updated

      newMessages.forEach(message => {
        // Check if the message object and ID are valid and if it hasn't been processed yet
        if (!message || !message.messageId || processedMessageIds.has(message.messageId)) {
          if (message?.messageId && processedMessageIds.has(message.messageId)) {
            pluginLogger.debug(`Skipping already processed message ${message.messageId}`);
          } else {
            pluginLogger.debug('Skipping invalid or already processed message:', message);
          }
          return; // Skip this message
        }

        const { messageId, message: messageText } = message;

        // Mark message as processed immediately
        setProcessedMessageIds(prevIds => new Set(prevIds).add(messageId));
        updated = true; // Mark that we are processing new data

        pluginLogger.info(`Processing message ${messageId}: ${messageText}`);
        const words = extractWords(messageText);

        if (words.length > 0) {
          // Update word counts using functional update
          setWordCounts(prevCounts => {
            const newCounts = { ...prevCounts };
            words.forEach(word => {
              newCounts[word] = (newCounts[word] || 0) + 1;
            });
            return newCounts;
          });
        } else {
          pluginLogger.debug(`No words extracted from message ${messageId}`);
        }
      });

      if (updated) {
        pluginLogger.info('Word counts updated.');
      }
    }
    // Depend only on the subscription data
  }, [subscriptionResponse.data]); // Removed processedMessageIds from dependencies

  // Removed removeMessage function

  // Adjusted styles for displaying word counts
  const wordCountContainerStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '70px',
    left: '140px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    zIndex: 1000,
    maxWidth: '300px', // Adjusted width
    maxHeight: '400px', // Added max height
    overflowY: 'auto', // Added scroll for overflow
    backgroundColor: 'rgba(255, 255, 255, 0.9)', // Lighter background
    color: 'black', // Darker text
    padding: '15px',
    borderRadius: '10px',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
    fontSize: '1em', // Adjusted font size
    // zIndex: 1000, // Removed duplicate zIndex
    pointerEvents: 'auto', // Allow interaction
  };

  const wordEntryStyle: React.CSSProperties = {
    marginBottom: '5px',
    borderBottom: '1px solid #eee',
    paddingBottom: '5px',
    display: 'flex',
    justifyContent: 'space-between',
  };

  // Sort words by count descending for display
  const sortedWordEntries = Object.entries(wordCounts).sort(([, countA], [, countB]) => countB - countA);

  return (
    <div style={wordCountContainerStyle}>
      <h3 style={{ marginTop: 0, borderBottom: '2px solid #ccc', paddingBottom: '10px' }}>Word Cloud</h3>
      {sortedWordEntries.length === 0 ? (
        <p>No messages yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sortedWordEntries.map(([word, count]) => (
            <li key={word} style={wordEntryStyle}>
              <span>{word}</span>
              <strong>{count}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PluginWordCloud;
