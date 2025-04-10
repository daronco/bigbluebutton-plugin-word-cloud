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

// Define an interface for the word data including the count and category, extending d3-cloud's Word
interface WordData extends cloud.Word {
  count: number;
  category: string; // Added category field
  // text and size are already part of cloud.Word
}

const extractWords = (text: string): string[] => {
  if (!text) return [];
  return text.toLowerCase().replace(/[.,!?;:]/g, '').split(/\s+/).filter(word => word.length > 0);
};

export function PluginWordCloud({ pluginUuid }: PluginWordCloudProps):
React.ReactElement<PluginWordCloudProps> {
  BbbPluginSdk.initialize(pluginUuid);
  const pluginApi = BbbPluginSdk.getPluginApi(pluginUuid);

  // State to store GLOBAL word counts (for font size)
  const [wordCounts, setWordCounts] = useState<Record<string, number>>({});
  // State to store word counts PER CATEGORY (minute) (for layout grouping)
  const [categorizedWordCounts, setCategorizedWordCounts] = useState<Record<string, Record<string, number>>>({});
  // State to keep track of processed message IDs to avoid duplicates
  const [processedMessageIds, setProcessedMessageIds] = useState<Set<string>>(new Set());
  // State to track the current category index, incremented by "/next"
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState<number>(0);
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

        // Destructure needed fields
        const { messageId, message: messageText } = message;

        // Mark message as processed immediately
        setProcessedMessageIds(prevIds => new Set(prevIds).add(messageId));
        updated = true; // Mark that we are processing new data

        // --- Check for /next command ---
        if (messageText.trim() === '/next') {
          pluginLogger.info(`Received /next command. Incrementing category index.`);
          setCurrentCategoryIndex(prevIndex => prevIndex + 1);
          // Do not process this message for words
          return; // Skip to the next message
        }

        // --- Process regular message ---
        const currentCategory = String(currentCategoryIndex); // Use current index as category string
        pluginLogger.info(`Processing message ${messageId} for category ${currentCategory}: ${messageText}`);
        const words = extractWords(messageText);

        if (words.length > 0) {
          // Update GLOBAL word counts
          setWordCounts(prevGlobalCounts => {
            const newGlobalCounts = { ...prevGlobalCounts };
            words.forEach(word => {
              newGlobalCounts[word] = (newGlobalCounts[word] || 0) + 1;
            });
            return newGlobalCounts;
          });

          // Update CATEGORIZED word counts using the currentCategory string
          setCategorizedWordCounts(prevCategorizedCounts => {
            const newCategorizedCounts = { ...prevCategorizedCounts };
            // Ensure the category entry exists
            if (!newCategorizedCounts[currentCategory]) {
              newCategorizedCounts[currentCategory] = {};
            }
            words.forEach(word => {
              newCategorizedCounts[currentCategory][word] = (newCategorizedCounts[currentCategory][word] || 0) + 1;
            });
            return newCategorizedCounts;
          });

        } else {
          pluginLogger.debug(`No words extracted from message ${messageId} for category ${currentCategory}`);
        }
      });

      if (updated) {
        pluginLogger.info('Global and categorized word counts updated.');
      }
    }
    // Depend only on the subscription data
  }, [subscriptionResponse.data]); // Removed processedMessageIds from dependencies

  // --- D3 Word Cloud Logic ---

  // Define min/max font sizes
  const minFontSize = 24;
  const maxFontSize = 98;
  // Color parameters removed - will use d3.schemeCategory10

  // Calculate min and max counts for normalization (still needed for font size)
  const counts = Object.values(wordCounts);
  const minCount = counts.length > 0 ? Math.min(...counts) : 1;
  const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

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
    // Store layout instance reference for cleanup
    // Correct type for the layout instance returned by cloud()
    let layoutInstance = null;

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

    // --- Dynamic Font Size Calculation ---
    const numUniqueWords = Object.keys(wordCounts).length;
    const wordCountThreshold = 20; // Threshold for adjusting min font size
    let effectiveMinFontSize = minFontSize; // Start with the default min size

    if (numUniqueWords > 0 && numUniqueWords < wordCountThreshold) {
      // If fewer words than threshold, increase the minimum size
      // Interpolate between minFontSize and a midpoint based on how few words there are
      const midFontSize = (minFontSize + maxFontSize) / 2;
      // boostFactor goes from 0 (at threshold-1 words) to 1 (at 1 word)
      const boostFactor = (wordCountThreshold - numUniqueWords) / (wordCountThreshold - 1);
      effectiveMinFontSize = minFontSize + (midFontSize - minFontSize) * boostFactor;
      pluginLogger.debug(`Adjusted min font size to ${effectiveMinFontSize.toFixed(2)} for ${numUniqueWords} words.`);
    }

    // Calculate min/max counts for normalization (needed for font size scaling)
    const counts = Object.values(wordCounts);
    const minCount = counts.length > 0 ? Math.min(...counts) : 1;
    const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

    // Define font size calculation logic *inside* the effect to use effectiveMinFontSize
    const calculateDynamicFontSize = (count: number): number => {
      if (maxCount === minCount) {
        // If all counts are the same, use an average of the effective min and max
        return (effectiveMinFontSize + maxFontSize) / 2;
      }
      // Linear interpolation between effectiveMinFontSize and maxFontSize
      const size = effectiveMinFontSize + ((count - minCount) / (maxCount - minCount)) * (maxFontSize - effectiveMinFontSize);
      // Clamp within the dynamic bounds (effectiveMinFontSize to maxFontSize)
      return Math.max(effectiveMinFontSize, Math.min(size, maxFontSize));
    };

    // Prepare data for d3-cloud from categorized counts
    // Each entry represents a unique word within a specific category (minute)
    const wordsData: WordData[] = [];
    Object.entries(categorizedWordCounts).forEach(([category, wordsInCategory]) => {
      Object.entries(wordsInCategory).forEach(([wordText, countInCategory]) => {
        // Get the GLOBAL count for font size calculation
        const globalCount = wordCounts[wordText] || 1; // Fallback to 1 if somehow missing
        wordsData.push({
          text: wordText,
          size: calculateDynamicFontSize(globalCount), // Size based on GLOBAL count
          count: globalCount, // Store global count in WordData for consistency with size
          category: category, // The category index string ('0', '1', '2', ...)
          // Let d3-cloud calculate x, y, rotate etc.
        });
      });
    });

    pluginLogger.debug(`Prepared ${wordsData.length} WordData entries for layout.`);

    // --- Category-Based Layout ---
    // Group the generated wordsData by category (minute string)
    const wordsByCategory = wordsData.reduce((acc, word) => {
      const category = word.category;
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(word);
      return acc;
    }, {} as Record<string, WordData[]>);

    const categories = Object.keys(wordsByCategory);
    const numCategories = categories.length;

    if (numCategories === 0) {
      pluginLogger.warn('No categories found, skipping layout.');
      // Potentially draw placeholder or clear SVG if needed, though handled earlier
      return;
    }

    // Calculate grid dimensions
    const cols = Math.ceil(Math.sqrt(numCategories));
    const rows = Math.ceil(numCategories / cols);
    const cellWidth = layoutWidth / cols;
    const cellHeight = layoutHeight / rows;

    pluginLogger.debug(`Grid: ${cols}x${rows}, Cell: ${cellWidth.toFixed(1)}x${cellHeight.toFixed(1)}`);

    const allLayoutPromises: Promise<WordData[]>[] = [];
    const allPositionedWords: WordData[] = []; // Array to collect results

    categories.forEach((category, index) => {
      const categoryWords = wordsByCategory[category];
      if (!categoryWords || categoryWords.length === 0) return; // Skip empty categories

      const colIndex = index % cols;
      const rowIndex = Math.floor(index / cols);
      const offsetX = colIndex * cellWidth;
      const offsetY = rowIndex * cellHeight;

      pluginLogger.debug(`Layout for category '${category}' in cell [${rowIndex}, ${colIndex}] offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);

      const layoutPromise = new Promise<WordData[]>((resolve) => {
        const categoryLayout = cloud<WordData>() // Specify WordData type here
          .size([cellWidth, cellHeight])
          .words(categoryWords) // Pass only words for this category
          .padding(1) // Maybe smaller padding within cells
          .rotate(() => (~~(Math.random() * 6) - 3) * 15) // Less rotation?
          .font('Tahoma')
          .fontSize(d => d.size || 10) // Use size from WordData
          .on('end', (positionedWords: WordData[]) => {
            // Adjust positions relative to the cell's offset
            const adjustedWords = positionedWords.map(word => ({
              ...word,
              x: (word.x || 0) + offsetX + cellWidth / 2, // Center within cell + offset
              y: (word.y || 0) + offsetY + cellHeight / 2, // Center within cell + offset
            }));
            pluginLogger.debug(`Layout finished for category '${category}', ${adjustedWords.length} words positioned.`);
            resolve(adjustedWords);
          });
        categoryLayout.start();
      });
      allLayoutPromises.push(layoutPromise);
    });

    // Wait for all category layouts to complete
    Promise.all(allLayoutPromises).then(results => {
      const combinedWords = results.flat(); // Combine words from all categories
      pluginLogger.info(`All category layouts finished. Total words: ${combinedWords.length}`);
      draw(combinedWords, width, height, margin); // Call draw with all positioned words
    }).catch(error => {
      pluginLogger.error('Error during category layout:', error);
    });
    // --- End Category-Based Layout ---

    // Helper function to ensure color is not too dark
    const ensureLightColor = (colorString: string): string => {
      const darkThreshold = 0x66; // Equivalent to #666666
      const defaultLightColor = '#cccccc';
      try {
        const color = d3.color(colorString);
        if (!color) return defaultLightColor; // Fallback if color parsing fails

        const { r, g, b } = color.rgb();
        // Check if all components are below the threshold
        if (r <= darkThreshold && g <= darkThreshold && b <= darkThreshold) {
          return defaultLightColor; // Return light grey if too dark
        }
        return colorString; // Return original color if light enough
      } catch (e) {
        pluginLogger.warn('Could not parse color string:', colorString, e);
        return defaultLightColor; // Fallback on error
      }
    };

    // Draw function: Renders the words using D3, now receives dimensions/margin
    // This function remains largely the same, but now receives words already positioned globally
    function draw(words: WordData[], svgWidth: number, svgHeight: number, svgMargin: number) {
      pluginLogger.debug('Drawing combined words:', words.length);

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
          // Translate group by the margin, as word coords are now relative to layout area top-left
          .attr('transform', `translate(${svgMargin}, ${svgMargin})`);

      // Define color scale within draw function scope to use helper
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

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
         // Use calculated x, y directly; they already include offsets
        .attr('transform', d => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`)
        .attr('font-size', d => `${d.size}px`)
        // Ensure the fill color is light enough
        .style('fill', d => ensureLightColor(colorScale(d.text || '')));

      // --- Enter Selection ---
      text.enter() // Add text.enter() back here
        .append('text')
          .style('font-family', 'Impact') // Match font used in layout
          // Ensure the initial fill color is light enough
          .style('fill', (d: WordData) => ensureLightColor(colorScale(d.text || '')))
          .attr('text-anchor', 'middle')
           // Use calculated x, y directly for initial position
          .attr('transform', (d: WordData) => `translate(${d.x || 0},${d.y || 0}) rotate(${d.rotate || 0})`)
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
      pluginLogger.debug('Cleanup triggered for word cloud effect.');
      // if (layoutInstance) {
      //   layoutInstance.stop(); // Stop the layout process if it's still running
      //   pluginLogger.debug('D3 layout stopped on cleanup.');
      // } else {
      //   pluginLogger.debug('Cleanup triggered for word cloud effect (no active layout).');
      // }
    };

  }, [wordCounts, categorizedWordCounts, dimensions]); // Re-run effect when counts or dimensions change

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
} // <-- Add missing closing brace for the PluginWordCloud function

export default PluginWordCloud;
