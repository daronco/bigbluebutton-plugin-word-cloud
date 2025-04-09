import { BbbPluginSdk, pluginLogger } from 'bigbluebutton-html-plugin-sdk';
import * as React from 'react';
import { useEffect, useState, useRef } from 'react'; // Removed useMemo, added useRef
import * as d3 from 'd3';
import * as cloud from 'd3-cloud'; // Changed to namespace import
import { scaleOrdinal } from 'd3-scale'; // Using d3-scale for colors potentially

import {
  PublicChatMessagesData,
  ChatMessage,
  PluginWordCloudProps,
} from './types';
import { PUBLIC_CHAT_MESSAGES_SUBSCRIPTION } from './queries';

// Define an interface for the word data including the count, extending d3-cloud's Word
interface WordData extends cloud.Word {
  count: number;
  // text and size are already part of cloud.Word, but we can redefine for clarity if needed
  // text: string;
  // size: number;
}

const extractWords = (text: string): string[] => {
  if (!text) return [];
  return text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(word => word.length > 0);
};

export function PluginWordCloud({ pluginUuid }: PluginWordCloudProps):
React.ReactElement<PluginWordCloudProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  // State to store word counts
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  // State to keep track of processed message IDs to avoid duplicates
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());
  // Ref for the container div where D3 will render the SVG
  const svgRef = useRef<HTMLDivElement>(null);

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

  // --- D3 Word Cloud Logic ---

  // Define min/max font sizes and color parameters
  const minFontSize = 12;
  const maxFontSize = 48;
  const baseHue = 210; // Blue hue
  const minSaturation = 20;
  const maxSaturation = 95;
  const minLightness = 75;
  const maxLightness = 40;

  // Calculate min and max counts for normalization
  const counts = Object.values(wordCounts);
  const minCount = counts.length > 0 ? Math.min(...counts) : 1;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

  // Helper function to calculate font size based on count
  const calculateFontSize = (count: number): number => {
    if (maxCount === minCount) {
      return (minFontSize + maxFontSize) / 2; // Average size if all counts are the same
    }
    // Linear interpolation
    const size = minFontSize + ((count - minCount) / (maxCount - minCount)) * (maxFontSize - minFontSize);
    return Math.max(minFontSize, Math.min(size, maxFontSize)); // Clamp within bounds
  };

  // Helper function to calculate color based on count (interpolating Saturation and Lightness)
  // Keep this function as it's useful for D3 fill style
  const calculateColor = (count: number, minC: number, maxC: number): string => {
    if (maxC === minC) {
      // Average saturation and lightness if all counts are the same
      const avgSaturation = (minSaturation + maxSaturation) / 2;
      const avgLightness = (minLightness + maxLightness) / 2;
      return `hsl(${baseHue}, ${avgSaturation}%, ${avgLightness}%)`;
    }
    // Linear interpolation for saturation and lightness
    const fraction = (count - minC) / (maxC - minC);
    const saturation = minSaturation + fraction * (maxSaturation - minSaturation);
    const lightness = minLightness + fraction * (maxLightness - minLightness); // Note: Lightness decreases for darker colors
    return `hsl(${baseHue}, ${Math.max(0, Math.min(saturation, 100))}%, ${Math.max(0, Math.min(lightness, 100))}%)`;
  };

  // Effect to run D3 layout when wordCounts changes or container resizes (simplified resize handling)
  useEffect(() => {
    if (!svgRef.current || Object.keys(wordCounts).length === 0) {
      // Clear previous SVG if no words or ref not ready
      if (svgRef.current) {
        d3.select(svgRef.current).select('svg').remove();
        // Optionally display "No messages yet" message here using D3
        d3.select(svgRef.current)
          .append('p')
          .attr('class', 'no-messages-placeholder') // Add a class for styling
          .style('color', '#666')
          .style('font-size', '16px')
          .style('text-align', 'center')
          .style('margin-top', '20px')
          .text('No messages yet.');
      }
      return; // Exit if no words or container not ready
    }

    // Clear any placeholder message
    d3.select(svgRef.current).select('.no-messages-placeholder').remove();

    const container = svgRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Prepare data for d3-cloud, explicitly typing as WordData[]
    const wordsData: WordData[] = Object.entries(wordCounts).map(([text, count]) => ({
      text,
      size: calculateFontSize(count), // Use existing font size calculation
      count, // Keep original count for color calculation
      // Initialize d3-cloud properties (optional, layout calculates them)
      // x: 0, y: 0, rotate: 0,
    }));

    // Find min/max counts again for color calculation within this scope
    const currentCounts = wordsData.map(d => d.count);
    const currentMinCount = currentCounts.length > 0 ? Math.min(...currentCounts) : 1;
    const currentMaxCount = currentCounts.length > 0 ? Math.max(...currentCounts) : 1;

    const layout = cloud()
      .size([width, height])
      .words(wordsData)
      .padding(5) // Padding between words
      // .rotate(() => ~~(Math.random() * 2) * 90) // Rotate words 0 or 90 degrees randomly
      .rotate(() => (~~(Math.random() * 6) - 3) * 30) // More varied rotation like original example
      .font('Impact') // Example font, choose one appropriate
      .fontSize((d: cloud.Word) => d.size || 10) // Added explicit type cloud.Word for 'd'
      .on('end', draw); // Callback function after layout finishes

    layout.start();

    // Draw function: Renders the words using D3, using our extended WordData interface
    function draw(words: WordData[]) {
      pluginLogger.debug('D3 layout finished, drawing words:', words.length);

      // Select the container, ensure SVG exists, or create it
      const svg = d3.select(svgRef.current)
        .selectAll<SVGSVGElement, unknown>('svg') // Use selectAll for potential existing SVG
        .data([null]) // Bind data to ensure only one SVG
        .join('svg') // Use join for enter/update/exit logic on the SVG itself
          .attr('width', width)
          .attr('height', height)
          .style('background-color', '#f8f8f8'); // Set background on SVG

      // Select the main group element, translate to center
      const g = svg.selectAll<SVGGElement, unknown>('g')
        .data([null])
        .join('g')
          .attr('transform', `translate(${width / 2},${height / 2})`);

      // D3 data join for text elements, using WordData
      const text = g.selectAll<SVGTextElement, WordData>('text')
        .data(words, d => d.text || ''); // Use word text as key

      // --- Exit Selection ---
      text.exit()
        .transition() // Fade out words that are no longer present
        .duration(800) // Match previous transition duration
        .style('fill-opacity', 1e-6)
        .attr('font-size', 1)
        .remove();

      // --- Update Selection ---
      text.transition() // Smoothly transition existing words
        .duration(800) // Match previous transition duration
        .attr('transform', d => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`) // Add fallbacks for safety
        .attr('font-size', d => `${d.size}px`)
        .style('fill', d => calculateColor(d.count, currentMinCount, currentMaxCount)); // Access d.count directly

      // --- Enter Selection ---
      text.enter() // Ensure text.enter() is called correctly
        .append('text')
          .style('font-family', 'Impact') // Match font used in layout
          .style('fill', (d: WordData) => calculateColor(d.count, currentMinCount, currentMaxCount)) // Add type WordData
          .attr('text-anchor', 'middle')
          .attr('transform', (d: WordData) => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`) // Add type WordData
          .text((d: WordData) => d.text || '') // Add type WordData
          // Initial state for transition
          .attr('font-size', 1)
        .transition() // Fade in and grow new words
          .duration(800) // Match previous transition duration
          .style('fill-opacity', 1)
          .attr('font-size', (d: WordData) => `${d.size}px`); // Add type WordData

      pluginLogger.debug('D3 drawing complete.');
    }

    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      layout.stop(); // Stop the layout process if it's still running
      pluginLogger.debug('D3 layout stopped on cleanup.');
    };

  }, [wordCounts]); // Re-run effect when wordCounts changes

  // --- Rendering Logic ---
  // Render a div container that D3 will use
  return (
    <div
      ref={svgRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden', // Prevent scrollbars if SVG slightly overflows
        boxSizing: 'border-box',
      }}
    />
  );
}

export default PluginWordCloud;
