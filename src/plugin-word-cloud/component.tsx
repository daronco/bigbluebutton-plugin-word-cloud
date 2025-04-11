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

// Regex to match various emoji presentations, including flags and variation selectors
// Using Unicode property escapes: \p{Emoji_Presentation}, \p{Emoji} with VS16, Regional Indicators for flags
const emojiIsolatingRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|(?:\p{Regional_Indicator}\p{Regional_Indicator})+|\p{Emoji})/gu;

const extractWords = (text: string): string[] => {
  if (!text) return [];

  // 1. Isolate emojis by adding spaces around them
  const spacedText = text.replace(emojiIsolatingRegex, ' $1 ');

  // 2. Convert to lowercase (emojis are generally unaffected, but standard words are)
  const lowerCaseText = spacedText.toLowerCase();

  // 3. Remove common punctuation
  const noPunctuationText = lowerCaseText.replace(/[.,!?;:]/g, '');

  // 4. Split by whitespace and filter out empty strings
  const words = noPunctuationText.split(/\s+/).filter(word => word.length > 0);

  return words;
};

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
    // Use pluginLogger if available, otherwise console.warn
    const logger = typeof pluginLogger !== 'undefined' ? pluginLogger : console;
    logger.warn('Could not parse color string:', colorString, e);
    return defaultLightColor; // Fallback on error
  }
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
  // State to track the current category index, incremented by "/cloud"
  const [currentCategoryIndex, setCurrentCategoryIndex] = useState<number>(0);
  // State to track the current visualization mode ('cloud' or 'chart')
  const [visualizationMode, setVisualizationMode] = useState<'cloud' | 'chart'>('cloud');
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

        // --- Check for commands ---
        const trimmedMessage = messageText.trim();
        if (trimmedMessage === '/cloud') {
          pluginLogger.info(`Received /cloud command. Switching to cloud view and incrementing category index.`);
          setVisualizationMode('cloud');
          setCurrentCategoryIndex(prevIndex => prevIndex + 1);
          return; // Skip processing words for this command
        } else if (trimmedMessage === '/chart') {
          pluginLogger.info(`Received /chart command. Switching to chart view.`);
          setVisualizationMode('chart');
          return; // Skip processing words for this command
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
  const maxFontSize = 120;
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

    // --- Handle Placeholder ---
    // Check for words *before* deciding cloud or chart
    if (Object.keys(wordCounts).length === 0) {
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
    } else {
      // Clear placeholder if words exist now
      d3.select(svgRef.current).select('.no-messages-placeholder-svg').remove();
    }
    // --- End Handle Placeholder ---


    // --- Proceed with Selected Visualization ---
    pluginLogger.debug(`Rendering visualization: ${visualizationMode} with dimensions: ${width}x${height}`);

    // Define margin and calculate layout area (used by both modes)
    const margin = 10; // Define margin in pixels
    const layoutWidth = width - margin * 2;
    const layoutHeight = height - margin * 2;

    // Ensure layout dimensions are not negative
    if (layoutWidth <= 0 || layoutHeight <= 0) {
      pluginLogger.warn('Layout dimensions too small or negative, skipping draw.');
      return;
    }

    if (visualizationMode === 'cloud') {
      // --- Word Cloud Layout Logic ---
      pluginLogger.debug('Starting word cloud layout process.');

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
      drawCloud(combinedWords, width, height, margin); // Call drawCloud with all positioned words
    }).catch(error => {
      pluginLogger.error('Error during category layout:', error);
    });
    // --- End Word Cloud Layout ---

    } else if (visualizationMode === 'chart') {
      // --- Bar Chart Logic ---
      pluginLogger.debug('Preparing data for bar chart.');

      // 1. Prepare data: Get top N words based on global count
      const topN = 20; // Show top 20 words, adjust as needed
      const chartData = Object.entries(wordCounts)
        .sort(([, countA], [, countB]) => countB - countA) // Sort descending by count
        .slice(0, topN) // Take top N
        .map(([text, count]) => ({ text, count })); // Map to object array

      pluginLogger.debug(`Prepared ${chartData.length} entries for bar chart.`);

      if (chartData.length === 0) {
         pluginLogger.warn('No data for chart, skipping draw.');
         // Placeholder logic is handled earlier, just return
         return;
      }

      drawChart(chartData, width, height); // Removed the 4th argument (margin)
      // --- End Bar Chart Logic ---
    }


    // --- Helper Functions ---
    // Moved ensureLightColor outside the useEffect hook

    // Draw function for Word Cloud: Renders the words using D3
    function drawCloud(words: WordData[], svgWidth: number, svgHeight: number, svgMargin: number) {
      pluginLogger.debug('Drawing word cloud:', words.length);

      // Select the container, ensure SVG exists, or create it
      const svg = d3.select(svgRef.current)
        .selectAll<SVGSVGElement, unknown>('svg') // Use selectAll for potential existing SVG
        .data([null]) // Bind data to ensure only one SVG
        .join('svg') // Use join for enter/update/exit logic on the SVG itself
          .attr('width', svgWidth) // Use passed width
          .attr('height', svgHeight) // Use passed height
          .style('background-color', '#000000'); // Set background to black

      // Clear previous contents (important when switching modes)
      svg.selectAll('*').remove();

      // Select the main group element, translate by the margin
      const g = svg.append('g') // Use append since we cleared content
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

      pluginLogger.debug('Word cloud drawing complete.');
    }

    // Draw function for Bar Chart
    function drawChart(data: { text: string, count: number }[], svgWidth: number, svgHeight: number, /* svgMargin is passed but we'll use a larger fixed margin here */) {
      pluginLogger.debug('Drawing bar chart:', data.length);

      // Increase margin for more padding around the chart
      const margin = { top: 40, right: 40, bottom: 80, left: 60 }; // Increased top/right/bottom/left margins

      const chartWidth = svgWidth - margin.left - margin.right;
      const chartHeight = svgHeight - margin.top - margin.bottom;

      // Select the container, ensure SVG exists, or create it
      const svg = d3.select(svgRef.current)
        .selectAll<SVGSVGElement, unknown>('svg')
        .data([null])
        .join('svg')
          .attr('width', svgWidth)
          .attr('height', svgHeight)
          .style('background-color', '#000000'); // Set background

      // Clear previous contents (important when switching modes)
      svg.selectAll('*').remove();

      // Create main group, translated by the new margin object
      const g = svg.append('g')
          .attr('transform', `translate(${margin.left}, ${margin.top})`);

      // Define color scale (can reuse the same one)
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

      // --- Scales ---
      const xScale = d3.scaleBand()
        .domain(data.map(d => d.text))
        .range([0, chartWidth])
        .padding(0.2); // Padding between bars, adjusted from example

      const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count) || 1]) // Max count or 1 if empty
        .range([chartHeight, 0]); // Inverted range for SVG y-coordinate

      // --- Axes ---
      const xAxis = d3.axisBottom(xScale);
      const yAxis = d3.axisLeft(yScale);

      // Append X axis
      g.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(xAxis)
        .selectAll('text') // Style axis text
          .style('fill', '#ccc')
          .style('font-size', '16px') // Set font size to 16px
          .attr('transform', 'translate(-10,0)rotate(-45)') // Rotate labels like example
          .style('text-anchor', 'end');

      // Append Y axis
      g.append('g')
        .attr('class', 'y-axis')
        // Apply integer formatting to the axis ticks
        .call(yAxis.tickFormat(d3.format("d")))
        .selectAll('text') // Style axis text
          .style('fill', '#ccc')
          .style('font-size', '16px'); // Set font size to 16px

      // Style axis lines and ticks
      g.selectAll('.domain, .tick line').style('stroke', '#666');

      // --- Bars ---
      const bars = g.selectAll(".bar") // Select by class instead of "mybar"
        // Explicitly type 'd' in the key function
        .data(data, (d: { text: string, count: number }) => d.text);

      // Exit
      bars.exit()
        .transition().duration(500)
        .attr('y', chartHeight)
        .attr('height', 0)
        .style('opacity', 0)
        .remove();

      // Update
      bars.transition().duration(500)
        .attr('x', d => xScale(d.text) || 0)
        .attr('y', d => yScale(d.count))
        .attr('width', xScale.bandwidth())
        .attr('height', d => chartHeight - yScale(d.count))
        .style('fill', d => ensureLightColor(colorScale(d.text))); // Use helper

      // Enter - Use join pattern like v6 example
      bars.enter()
        .append('rect')
          .attr('class', 'bar')
          .attr('x', d => xScale(d.text) || 0)
          .attr('y', chartHeight) // Start from bottom
          .attr('width', xScale.bandwidth())
          .attr('height', 0) // Start with zero height
          .style('fill', d => ensureLightColor(colorScale(d.text))) // Use helper
        .transition().duration(500) // Animate entrance
          .attr('y', d => yScale(d.count))
          .attr('height', d => chartHeight - yScale(d.count));

      pluginLogger.debug('Bar chart drawing complete.');
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

  }, [wordCounts, categorizedWordCounts, dimensions, visualizationMode]); // Added visualizationMode

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
