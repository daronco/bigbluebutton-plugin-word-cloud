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
  // State to store container dimensions for responsive layout
  const [dimensions, setDimensions] = useState<[number, number]>([0, 0]);

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

  // Define min/max font sizes
  const minFontSize = 12;
  const maxFontSize = 48;
  // Color parameters removed - will use d3.schemeCategory10

  // Calculate min and max counts for normalization (still needed for font size)
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

  // Removed the HSL-based calculateColor function

  // Define a categorical color scale using a bright scheme suitable for dark backgrounds
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  // Effect to setup ResizeObserver for responsive layout
  useEffect(() => {
    if (!svgRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setDimensions([width, height]);
      pluginLogger.debug(`Resized to: ${width}x${height}`);
    });

    resizeObserver.observe(svgRef.current);

    // Set initial dimensions
    const { clientWidth, clientHeight } = svgRef.current;
    setDimensions([clientWidth, clientHeight]);
    pluginLogger.debug(`Initial dimensions: ${clientWidth}x${clientHeight}`);


    // Cleanup observer on component unmount
    return () => resizeObserver.disconnect();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to run D3 layout when wordCounts or dimensions change
  useEffect(() => {
    const [width, height] = dimensions; // Get current dimensions from state

    if (!svgRef.current || width === 0 || height === 0) {
      pluginLogger.debug('Skipping D3 layout: No ref or zero dimensions');
      return; // Don't run if ref isn't ready or dimensions are zero
    }

    if (Object.keys(wordCounts).length === 0) {
      // Handle the "no words" case - draw placeholder
      pluginLogger.debug('No words, drawing placeholder.');
      // Remove any existing SVG (either word cloud or placeholder)
      d3.select(svgRef.current).select('svg').remove();

      // Create a placeholder SVG with centered text using current dimensions
      const placeholderSvg = d3.select(svgRef.current)
        .append('svg')
          .attr('width', width)
          .attr('height', height)
          .attr('class', 'no-messages-placeholder-svg') // Add class to SVG for removal
          .style('background-color', '#000000'); // Match background

      placeholderSvg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('dy', '0.35em') // Adjust vertical alignment slightly
        .style('fill', '#ccc') // Light gray color for dark background
        .style('font-size', '24px')
        .style('text-anchor', 'middle') // Center text horizontally
        .text('Type something in chat!');

      return; // Exit after drawing placeholder
    }

    // --- Proceed with Word Cloud Drawing ---
    pluginLogger.debug(`Running D3 layout with dimensions: ${width}x${height}`);

    // Clear any placeholder SVG if it exists
    d3.select(svgRef.current).select('.no-messages-placeholder-svg').remove();

    // Define margin and calculate layout area
    const margin = 10; // Define margin in pixels
    const layoutWidth = width - margin * 2;
    const layoutHeight = height - margin * 2;

    // Ensure layout dimensions are not negative
    if (layoutWidth <= 0 || layoutHeight <= 0) {
      pluginLogger.warn('Layout dimensions too small or negative, skipping draw.');
      return;
    }

    // Prepare data for d3-cloud, explicitly typing as WordData[]
    const wordsData: WordData[] = Object.entries(wordCounts).map(([text, count]) => ({
      text,
      size: calculateFontSize(count), // Use existing font size calculation
      count, // Keep original count for color calculation
      // Initialize d3-cloud properties (optional, layout calculates them)
      // x: 0, y: 0, rotate: 0,
    }));

    const layout = cloud()
      .size([layoutWidth, layoutHeight]) // Use calculated layout size
      .words(wordsData)
      .padding(5) // Padding between words
      //.rotate(() => ~~(Math.random() * 2) * 90) // Rotate words 0 or 90 degrees randomly
      .rotate(() => (~~(Math.random() * 6) - 3) * 30) // More varied rotation like original example
      .font('Impact') // Example font, choose one appropriate
      .fontSize((d: cloud.Word) => d.size || 12) // Added explicit type cloud.Word for 'd'
      .on('end', (drawnWords: WordData[]) => draw(drawnWords, width, height, margin)); // Pass dimensions and margin to draw

    layout.start();

    // Draw function: Renders the words using D3, now receives dimensions/margin
    function draw(words: WordData[], svgWidth: number, svgHeight: number, svgMargin: number) {
      pluginLogger.debug('D3 layout finished, drawing words:', words.length);

      // Select the container, ensure SVG exists, or create it
      const svg = d3.select(svgRef.current)
        .selectAll<SVGSVGElement, unknown>('svg') // Use selectAll for potential existing SVG
        .data([null]) // Bind data to ensure only one SVG
        .join('svg') // Use join for enter/update/exit logic on the SVG itself
          .attr('width', svgWidth) // Use passed width
          .attr('height', svgHeight) // Use passed height
          .style('background-color', '#000000'); // Set background to black

      // Select the main group element, translate by the margin
      const g = svg.selectAll<SVGGElement, unknown>('g')
        .data([null])
        .join('g')
          .attr('transform', `translate(${width/2}, ${height/2})`); // Translate by margin

      // D3 data join for text elements, using WordData
      const text = g.selectAll<SVGTextElement, WordData>('text')
        .data(words, d => d.text || ''); // Use word text as key

      // --- Exit Selection ---
      text.exit()
        .transition() // Fade out words that are no longer present
        .duration(1600) // Match previous transition duration
        .style('fill-opacity', 1e-6)
        .attr('font-size', 1)
        .remove();

      // --- Update Selection ---
      text.transition() // Smoothly transition existing words
        .duration(1600) // Match previous transition duration
        .attr('transform', d => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`) // Add fallbacks for safety
        .attr('font-size', d => `${d.size}px`)
        .style('fill', d => colorScale(d.text || '')); // Use color scale based on word text

      // --- Enter Selection ---
      text.enter() // Add text.enter() back here
        .append('text')
          .style('font-family', 'Impact') // Match font used in layout
          .style('fill', (d: WordData) => colorScale(d.text || '')) // Use color scale based on word text
          .attr('text-anchor', 'middle')
          .attr('transform', (d: WordData) => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`) // Add type WordData
          .text((d: WordData) => d.text || '') // Add type WordData
          // Initial state for transition
          .style('fill-opacity', 1e-6) // Start transparent for fade-in
          .attr('font-size', 1)
        .transition() // Fade in and grow new words
          .duration(1600) // Match previous transition duration
          .style('fill-opacity', 1)
          .attr('font-size', (d: WordData) => `${d.size}px`); // Add type WordData

      pluginLogger.debug('D3 drawing complete.');
    }

    // Cleanup function for when the component unmounts or dependencies change
    return () => {
      layout.stop(); // Stop the layout process if it's still running
      pluginLogger.debug('D3 layout stopped on cleanup.');
    };

  }, [wordCounts, dimensions]); // Re-run effect when wordCounts or dimensions change

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
