/**
 * Chat Module - GenAI Conversational Search
 * Handles natural language queries for data exploration and scenario analysis
 *
 * Dependencies: asyncllm, marked, highlight.js, lit-html, bootstrap-llm-provider
 */

import { asyncLLM } from "asyncllm";
import { bootstrapAlert } from "bootstrap-alert";
import { openaiConfig } from "bootstrap-llm-provider";
import hljs from "highlight.js";
import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { Marked } from "marked";
import { parse } from "partial-json";
import saveform from "saveform";

// Initialize Markdown renderer with code highlighting
const marked = new Marked();
marked.use({
  renderer: {
    code(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return /* html */ `<pre class="hljs language-${language}"><code>${
        hljs.highlight(code, { language }).value.trim()
      }</code></pre>`;
    },
  },
});

// Default LLM provider endpoints
const DEFAULT_BASE_URLS = [
  // OpenAI endpoints
  "https://api.openai.com/v1",
  "https://aipipe.org/openai/v1",
  // OpenRouter endpoints
  "https://openrouter.ai/api/v1",
  "https://aipipe.org/openrouter/v1",
];

// Settings form persistence
const settingsForm = saveform("#settings-form");

// Conversation history
let conversationHistory = [];
let dataContext = null;
let uiMessages = [];

// Default system prompt template
const DEFAULT_SYSTEM_PROMPT = `You are the Pizza Hut Analyst for the Pizza Hut Pricing Elasticity Studio.

**Your Role:**
- Interpret scenario simulation results and provide business insights
- Analyze visualizations and explain what they mean
- Suggest optimal scenarios based on business goals
- Compare multiple scenarios and highlight trade-offs
- Help users understand price elasticity and its impact

**Pizza Hut Foundation Context:**
{yumBrandContext}

**Current Business Context:**
- Weekly Order Proxy: {currentCustomers}
- Revenue Proxy: {currentRevenue}
- Average Repeat Loss Rate: {currentChurn}

**Elasticity Reference Points:**
- Entry & Value Meals ladder: {elasticityAdSupported}
- Core & Premium Meals ladder: {elasticityAdFree}

**Available Scenarios:**
{availableScenarios}

**Current Simulation:**
{currentSimulation}

**Saved Scenarios for Comparison:**
{savedScenarios}

**Customer Segmentation:**
{segmentSummary}

**Available Segments for Targeting:**
{availableSegments}

**Available Tools:**
1. **interpret_scenario** - Analyze a scenario's results with detailed metrics and trade-offs
2. **suggest_scenario** - Get scenario suggestions based on business goals (maximize_revenue, grow_customers, reduce_churn [repeat loss], maximize_aov)
3. **analyze_chart** - Explain what a specific visualization shows (demand_curve, tier_mix, forecast, heatmap)
4. **compare_outcomes** - Deep comparison of 2 or more scenarios with trade-off analysis
5. **create_scenario** - Generate a new custom scenario from parameters
6. **query_segments** - Get detailed information about customer segments (filter by demand ladder, size, repeat-loss risk, value)

**How to Use Tools:**
- When users ask to interpret results: Use interpret_scenario with the scenario_id
- When users ask "which scenario is best for X": Use suggest_scenario with the goal
- When users ask about a chart: Use analyze_chart with the chart name
- When users want to compare 2+ scenarios: Use compare_outcomes with array of scenario_ids
- When users want to create new scenarios: Use create_scenario with parameters
- When users ask about customer segments: Use query_segments with filters (demand ladder, size, repeat-loss risk, value)

**Response Guidelines:**
- Focus on business interpretation, recommended actions, and trust in the underlying data
- Explain trade-offs clearly (revenue vs demand, short-term vs longer-term)
- Highlight scope, risks, and warnings from simulations
- Use business-friendly language, avoid technical jargon
- Provide actionable recommendations
- Format numbers with proper currency/percentage symbols
- Cite elasticity values when explaining price sensitivity
- Be explicit when an answer applies only to one selected brand, cohort, mission, or channel
- When users save scenarios, you can compare them using the compare_outcomes tool
- When a message contains an "Active Screen Context" block, treat that as the primary scope and answer from that screen's current state first

Be concise and informative in your responses. Ask follow-up questions only when they are necessary.
Return the response in Markdown format for rich text display. (Bold important points, use lists for clarity, and include code blocks for any data or JSON.)

**Example Interactions:**
User: "Interpret the current scenario"
→ Use interpret_scenario with the current scenario_id

User: "What scenario maximizes revenue?"
→ Use suggest_scenario with goal: "maximize_revenue"

User: "Explain the demand curve"
→ Use analyze_chart with chartName: "demand_curve"

User: "Compare scenario_001 and scenario_002"
→ Use compare_outcomes with scenario_ids: ["scenario_001", "scenario_002"]

User: "Compare scenario_001, scenario_002, and scenario_003"
→ Use compare_outcomes with scenario_ids: ["scenario_001", "scenario_002", "scenario_003"]

User: "Compare all saved scenarios"
→ Use compare_outcomes with the IDs from the saved scenarios list (can be 2, 3, 4+ scenarios)

User: "Which saved scenario is best for revenue?"
→ Use compare_outcomes with saved scenario IDs and explain which optimizes revenue

User: "Show me high repeat-loss segments"
→ Use query_segments with filter: {repeat_loss_risk: "high"}

User: "What are the largest segments in the entry and value menu ladder?"
→ Use query_segments with filter: {tier: "ad_supported", size: "large"}`;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getChatFeeds() {
  return Array.from(document.querySelectorAll('[data-chat-feed]'));
}

function getEmptyStateMarkup(variant = 'compact') {
  if (variant === 'full') {
    return `
      <div class="text-center text-muted mt-5">
        <i class="bi bi-robot display-4 mb-3"></i>
        <p><strong>Pizza Hut Pricing Analyst</strong></p>
        <p class="small">Ask me to summarize the current business, explain the elasticity readouts, compare options, or turn the evidence into actions.</p>
      </div>
    `;
  }

  return `
    <div class="assistant-chat-empty">
      <div class="assistant-chat-empty__icon"><i class="bi bi-stars"></i></div>
      <div class="assistant-chat-empty__title">Ask the Pizza Hut analyst about this screen</div>
      <div class="assistant-chat-empty__copy">Use the prompt chips below or type a question to turn this screen into a clear business readout.</div>
    </div>
  `;
}

function renderAllChatFeeds() {
  const feeds = getChatFeeds();
  feeds.forEach((feed) => {
    const variant = feed.dataset.chatVariant || 'compact';
    const visibleMessages = variant === 'full' ? uiMessages : uiMessages.slice(-4);

    if (!visibleMessages.length) {
      feed.innerHTML = getEmptyStateMarkup(variant);
      return;
    }

    feed.innerHTML = visibleMessages.map((message) => {
      const icon = message.role === 'user' ? '👤' : message.role === 'system' ? '⚙️' : '🤖';
      const label = message.role === 'user' ? 'You' : message.role === 'system' ? 'System' : 'Pizza Hut Analyst';
      const contentMarkup = message.isLoading
        ? `
            <span class="spinner-border spinner-border-sm me-2"></span>
            <span class="text-muted">Thinking...</span>
          `
        : message.role === 'assistant'
          ? marked.parse(message.content || '')
          : `<div>${escapeHtml(message.content || '')}</div>`;

      return `
        <div id="${message.id}" class="chat-message mb-3 ${message.role} ${message.customClass || ''}">
          <div class="d-flex align-items-start">
            <div class="me-2">${icon}</div>
            <div class="flex-grow-1">
              <div class="text-muted small mb-1">${label}</div>
              <div class="message-content">${contentMarkup}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    feed.scrollTop = feed.scrollHeight;
  });
}

function setChatComposerEnabled(enabled, reason = '') {
  document.querySelectorAll('.assistant-chat-input, .assistant-chat-send-btn, .suggested-query').forEach((node) => {
    node.disabled = !enabled;
  });

  document.querySelectorAll('.assistant-chat-input').forEach((input) => {
    input.placeholder = enabled
      ? 'Ask about Pizza Hut elasticity: summarize, explain, compare, or recommend actions...'
      : (reason || 'Configure the LLM with the key button to enable chat.');
  });
}

/**
 * Initialize chat module with data context
 * @param {Object} context - Application data context
 */
export function initializeChat(context) {
  dataContext = context;
  renderAllChatFeeds();

  // Set up settings form handlers
  const resetButton = document.querySelector("#settings-form [type=reset]");
  const saveButton = document.getElementById("settings-save-btn");
  const systemPromptInput = document.getElementById("systemPrompt");

  // Load default prompt only on first visit (when no saved value exists)
  // Check localStorage directly to avoid overwriting restored values
  if (systemPromptInput) {
    const savedData = localStorage.getItem('saveform:#settings-form');
    const parsedSavedData = savedData ? JSON.parse(savedData) : null;
    const savedPrompt = parsedSavedData?.systemPrompt;
    const hasSavedPrompt = !!savedPrompt;
    const shouldReplaceLegacyPrompt = typeof savedPrompt === 'string' && savedPrompt.includes('Pricing Elasticity Studio');

    // Only populate default if there's no saved value AND textarea is empty
    if ((!hasSavedPrompt && !systemPromptInput.value.trim()) || shouldReplaceLegacyPrompt) {
      systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
      // Trigger saveform to save this initial value
      settingsForm.save();
    }
  }

  // Explicitly save form data when Save button is clicked
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      settingsForm.save();
      console.log('Settings saved to localStorage');
    });
  }

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      settingsForm.clear();
      // Show default prompt in textarea after reset
      if (systemPromptInput) {
        systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
        // Save the reset values
        settingsForm.save();
      }
    });
  }

  // Check if LLM is already configured and enable chat UI
  checkAndEnableChatUI();
}

/**
 * Check if LLM is configured and enable chat UI if so
 */
async function checkAndEnableChatUI() {
  try {
    // Try to get existing config without showing modal
    const config = await openaiConfig({
      defaultBaseUrls: DEFAULT_BASE_URLS,
      show: false  // Don't show modal, just check if config exists
    });

    // If we got a config with apiKey, enable the chat UI
    if (config && config.apiKey) {
      console.log('LLM already configured, enabling chat UI');
      setChatComposerEnabled(true);
    } else {
      console.log('LLM not configured yet, chat UI will remain disabled until configuration');
      setChatComposerEnabled(false, 'Configure the LLM with the key button to enable chat.');
    }
  } catch (error) {
    // Config doesn't exist yet, that's fine
    console.log('LLM not configured yet:', error.message);
    setChatComposerEnabled(false, 'Configure the LLM with the key button to enable chat.');
  }
}

/**
 * Get the model name from settings form
 * @returns {string} The model name
 */
function getModelName() {
  const modelInput = document.getElementById("model");
  return modelInput?.value || "gpt-4.1-mini";
}

/**
 * Configure LLM settings - Shows the configuration modal
 */
export async function configureLLM() {
  try {
    await openaiConfig({
      show: true,
      defaultBaseUrls: DEFAULT_BASE_URLS
    });

    // Enable chat UI after configuration
    setChatComposerEnabled(true);

    bootstrapAlert({
      color: "success",
      title: "LLM Configured",
      body: "You can now start asking questions!"
    });
  } catch (error) {
    console.error('Error configuring LLM:', error);
    bootstrapAlert({
      color: "danger",
      title: "Configuration Error",
      body: error.message
    });
  }
}

async function getChatConfig(show = true) {
  const config = await openaiConfig({
    show,
    defaultBaseUrls: DEFAULT_BASE_URLS
  });

  if (!config?.apiKey || !config?.baseUrl) {
    throw new Error('Missing API key or base URL. Configure the LLM connection first.');
  }

  return config;
}

async function parseErrorResponse(response) {
  const text = await response.text().catch(() => '');
  try {
    const payload = JSON.parse(text);
    return payload?.error?.message || payload?.message || text || `HTTP error! status: ${response.status}`;
  } catch {
    return text || `HTTP error! status: ${response.status}`;
  }
}

function looksLikeToolSupportError(message = '') {
  const lower = String(message).toLowerCase();
  return /(tool|tools|tool_choice|function|function_call)/.test(lower)
    && /(unsupported|not supported|unknown|invalid|not allowed|unrecognized)/.test(lower);
}

async function requestJsonChatCompletion(baseUrl, apiKey, requestBody) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  if (!choice?.message) {
    throw new Error('Model returned an unexpected response payload.');
  }

  return choice.message;
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (part?.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }

      if (typeof part?.text?.value === 'string') {
        return part.text.value;
      }

      return '';
    }).filter(Boolean).join('\n');
  }

  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') {
      return content.text;
    }

    if (typeof content.content === 'string') {
      return content.content;
    }

    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }

  return '';
}

async function requestPlainAssistantReply(baseUrl, apiKey, messages) {
  const message = await requestJsonChatCompletion(baseUrl, apiKey, {
    model: getModelName(),
    messages,
    stream: false
  });

  return normalizeMessageContent(message.content) || 'No response received from the model.';
}

function buildToollessContinuationMessages(systemPrompt, history) {
  const transcript = history.map((message) => {
    if (message.role === 'user') {
      return `[User]\n${normalizeMessageContent(message.content)}`;
    }

    if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      const toolList = message.tool_calls.map((call) => call?.function?.name).filter(Boolean).join(', ');
      return `[Assistant planned tools]\n${toolList || 'tool call requested'}`;
    }

    if (message.role === 'assistant') {
      return `[Assistant]\n${normalizeMessageContent(message.content)}`;
    }

    if (message.role === 'tool') {
      return `[Tool: ${message.name || 'tool'}]\n${normalizeMessageContent(message.content)}`;
    }

    return `[${message.role || 'message'}]\n${normalizeMessageContent(message.content)}`;
  }).filter(Boolean).join('\n\n');

  return [
    {
      role: 'system',
      content: `${systemPrompt}

If tool results are provided as transcript blocks instead of native tool messages, treat them as trusted structured outputs from the application and use them directly.`
    },
    {
      role: 'user',
      content: `${transcript}

Using the transcript above, provide the final assistant response to the latest user request.`
    }
  ];
}

/**
 * Build system prompt with current scenario-focused context
 */
function buildSystemPrompt() {
  const allScenarios = dataContext.allScenarios || [];
  const businessContext = dataContext.businessContext || {};
  const currentSim = dataContext.getCurrentSimulation ? dataContext.getCurrentSimulation() : null;
  const savedScenarios = dataContext.getSavedScenarios ? dataContext.getSavedScenarios() : [];

  // Check if user has provided a custom system prompt
  const customPromptInput = document.getElementById("systemPrompt");
  const customPrompt = customPromptInput?.value?.trim();

  // Use custom prompt if provided, otherwise use default
  let promptTemplate = customPrompt || DEFAULT_SYSTEM_PROMPT;

  // Format saved scenarios for the prompt
  const savedScenariosText = savedScenarios.length > 0
    ? savedScenarios.map(s => {
        if (s.delta && s.delta.revenue_pct !== undefined) {
          return `- ${s.scenario_id}: ${s.scenario_name} (Revenue ${s.delta.revenue_pct >= 0 ? '+' : ''}${s.delta.revenue_pct.toFixed(1)}%, Orders ${s.delta.customers_pct >= 0 ? '+' : ''}${s.delta.customers_pct.toFixed(1)}%)`;
        } else {
          return `- ${s.scenario_id}: ${s.scenario_name}`;
        }
      }).join('\n')
    : 'No scenarios saved for comparison yet';

  let yumBrandContext = 'Pizza Hut operating foundation not loaded yet.';
  if (window.yumFoundation?.summary) {
    const summary = window.yumFoundation.summary;
    yumBrandContext = `Brand: ${summary.brandId}
Stores: ${summary.stores}
Markets: ${summary.markets}
Items: ${summary.items}
Channels: ${(summary.channels || []).join(', ') || 'N/A'}
Latest Week: ${summary.latestWeek || 'N/A'}
Latest Revenue: $${Math.round(summary.latestRevenue || 0).toLocaleString()}
Main Grain: week_start x brand_id x market_id x product_id x channel_id`;
  }

  // Get segment data if available
  let segmentSummary = 'Segment data not loaded yet';
  let availableSegments = 'No segments available';

  if (window.segmentEngine) {
    try {
      // Get all segments to compute summary
      const allSegments = window.segmentEngine.filterSegments({});

      if (allSegments && allSegments.length > 0) {
        // Compute segment statistics
        const totalSegments = allSegments.length;
        const tierCounts = {};
        let totalCustomers = 0;
        let totalRepeatLoss = 0;
        let totalAOV = 0;

        allSegments.forEach(seg => {
          tierCounts[seg.tier] = (tierCounts[seg.tier] || 0) + 1;
          totalCustomers += parseInt(seg.customer_count) || 0;
          totalRepeatLoss += parseFloat(seg.repeat_loss_rate) || 0;
          totalAOV += parseFloat(seg.avg_order_value) || 0;
        });

        const avgRepeatLoss = (totalRepeatLoss / totalSegments * 100).toFixed(2);
        const avgAOV = (totalAOV / totalSegments).toFixed(2);

        segmentSummary = `${totalSegments} behavioral segments across 2 modeled Pizza Hut demand ladders:
- Entry & Value Meals: ${tierCounts['ad_supported'] || 0} segments
- Core & Premium Meals: ${tierCounts['ad_free'] || 0} segments
Total Customers: ${totalCustomers.toLocaleString()}
Avg Repeat Loss: ${avgRepeatLoss}%
Avg Order Value: $${avgAOV}`;

        // List available segments for targeting (15 predefined segments)
        availableSegments = `Behavioral segments for targeted pricing:
Visit mission: Game-Day First Try, Weekly Meal Routine, Group Occasion Buyer, Digital Discovery Guest, Value Offer Triggered
Repeat behavior: Family Ritual Loyalist, Value Bundle Shopper, Coupon-Driven Guest, Occasional Craving Guest, Channel Switcher
Basket build: Single Pizza Order, Multi-Item Builder, Bundle Buyer, Premium Add-On, Side Sampler

Use filters by demand ladder, repeat-loss risk, and basket value.`;
      }
    } catch (error) {
      console.error('Error getting segment data for chat:', error);
    }
  }

  // Replace placeholders with actual values
  const prompt = promptTemplate
    .replace('{yumBrandContext}', yumBrandContext)
    .replace('{currentCustomers}', businessContext.currentCustomers?.toLocaleString() || 'N/A')
    .replace('{currentRevenue}', businessContext.currentRevenue ? `$${businessContext.currentRevenue.toLocaleString()}` : 'N/A')
    .replace('{currentChurn}', businessContext.currentChurn ? `${(businessContext.currentChurn * 100).toFixed(2)}%` : 'N/A')
    .replace('{elasticityAdSupported}', (businessContext.elasticityByTier?.ad_supported || -2.1).toString())
    .replace('{elasticityAdFree}', (businessContext.elasticityByTier?.ad_free || -1.9).toString())
    .replace('{availableScenarios}', allScenarios.slice(0, 8).map(s => `- ${s.id}: ${s.name}`).join('\n') || 'None loaded yet')
    .replace('{currentSimulation}', currentSim && currentSim.delta ? `Active: "${currentSim.scenario_name}" - Revenue ${currentSim.delta.revenue_pct >= 0 ? '+' : ''}${currentSim.delta.revenue_pct.toFixed(1)}%, Orders ${currentSim.delta.customers_pct >= 0 ? '+' : ''}${currentSim.delta.customers_pct.toFixed(1)}%` : currentSim ? `Active: "${currentSim.scenario_name}"` : 'No scenario simulated yet')
    .replace('{savedScenarios}', savedScenariosText)
    .replace('{segmentSummary}', segmentSummary)
    .replace('{availableSegments}', availableSegments);

  return prompt;
}

/**
 * Define scenario-focused tools for the LLM to call
 */
function getToolDefinitions() {
  return [
    {
      type: "function",
      function: {
        name: "interpret_scenario",
        description: "Analyze and interpret a specific scenario's simulation results. Provides detailed metrics, trade-offs, risks, and business insights.",
        parameters: {
          type: "object",
          properties: {
            scenario_id: {
              type: "string",
              description: "ID of the scenario to interpret (e.g., 'scenario_001', 'scenario_002', 'scenario_003')"
            }
          },
          required: ["scenario_id"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "suggest_scenario",
        description: "Get AI-powered scenario suggestions based on a specific business goal. Returns optimal strategy and parameters.",
        parameters: {
          type: "object",
          properties: {
            goal: {
              type: "string",
              enum: ["maximize_revenue", "grow_customers", "reduce_churn", "maximize_aov"],
              description: "The business goal to optimize for"
            }
          },
          required: ["goal"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "analyze_chart",
        description: "Explain what a specific visualization shows and how to interpret it. Provides context and insights about the chart.",
        parameters: {
          type: "object",
          properties: {
            chart_name: {
              type: "string",
              enum: ["demand_curve", "tier_mix", "forecast", "heatmap"],
              description: "The name of the chart to analyze"
            }
          },
          required: ["chart_name"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "compare_outcomes",
        description: "Deep comparison of 2 or more scenarios with trade-off analysis. Shows which scenario is best for each metric and explains the business implications.",
        parameters: {
          type: "object",
          properties: {
            scenario_ids: {
              type: "array",
              items: { type: "string" },
              description: "Array of 2 or more scenario IDs to compare (e.g., ['scenario_001', 'scenario_002', 'scenario_003'])",
              minItems: 2
            }
          },
          required: ["scenario_ids"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "create_scenario",
        description: "Create a new custom pricing scenario from user-specified parameters. Can create price change scenarios or promotional scenarios.",
        parameters: {
          type: "object",
          properties: {
            tier: {
              type: "string",
              enum: ["ad_supported", "ad_free"],
              description: "The modeled demand ladder to adjust (ad_supported = Entry & Value Meals, ad_free = Core & Premium Meals)"
            },
            price_change: {
              type: "number",
              description: "Dollar amount to change price (e.g., 1.00 for +$1, -2.00 for -$2). Omit if creating a promotion."
            },
            promotion_discount: {
              type: "number",
              description: "Discount percentage for promotion (e.g., 50 for 50% off). Required if creating promotion."
            },
            promotion_duration: {
              type: "integer",
              description: "Duration of promotion in months (1-12). Required if creating promotion."
            }
          },
          required: ["tier"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "query_segments",
        description: "Query customer segments with filters to get detailed segment information. Returns segment metrics like customer count, repeat loss rate, avg order value, and elasticity.",
        parameters: {
          type: "object",
          properties: {
            tier: {
              type: "string",
              enum: ["ad_supported", "ad_free", "all"],
              description: "Filter by modeled demand ladder. Use 'all' to include both ladders."
            },
            size: {
              type: "string",
              enum: ["small", "medium", "large", "all"],
              description: "Filter by segment size based on customer count. Use 'all' to include all sizes."
            },
            repeat_loss_risk: {
              type: "string",
              enum: ["low", "medium", "high", "all"],
              description: "Filter by repeat-loss risk level. Use 'all' to include all risk levels."
            },
            value: {
              type: "string",
              enum: ["low", "medium", "high", "all"],
              description: "Filter by segment value (avg order value). Use 'all' to include all value levels."
            },
            limit: {
              type: "integer",
              description: "Maximum number of segments to return (default: 10)"
            }
          },
          required: []
        }
      }
    }
  ];
}

/**
 * Send a message to the LLM
 * @param {string} userMessage - User's question
 * @returns {Promise<void>}
 */
export async function sendMessage(userMessage, options = {}) {
  const displayMessage = typeof userMessage === 'string'
    ? userMessage
    : userMessage?.displayMessage || '';
  const contextBlock = typeof userMessage === 'object'
    ? userMessage?.contextBlock || ''
    : options.contextBlock || '';

  if (!dataContext) {
    bootstrapAlert({
      color: "warning",
      title: "Data Not Loaded",
      body: "Please load data first before asking questions."
    });
    return;
  }

  // Add user message to UI and history
  appendMessage('user', displayMessage);
  const actualUserMessage = contextBlock
    ? `[Active Screen Context]\n${contextBlock}\n\n[User Question]\n${displayMessage}\n\nAnswer specifically for this active screen and selected state unless the user asks for a broader cross-screen answer.`
    : displayMessage;
  conversationHistory.push({
    role: "user",
    content: actualUserMessage
  });

  // Show loading indicator
  const loadingId = appendMessage('assistant', '...', true);

  try {
    const { baseUrl, apiKey } = await getChatConfig(false);
    const systemPrompt = buildSystemPrompt();

    // Prepare API request (NON-STREAMING first to get tool calls immediately)
    const requestBody = {
      model: getModelName(),
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
      ],
      tools: getToolDefinitions(),
      tool_choice: "auto",
      stream: false
    };
    let message;
    try {
      message = await requestJsonChatCompletion(baseUrl, apiKey, requestBody);
    } catch (error) {
      if (!looksLikeToolSupportError(error.message)) {
        throw error;
      }

      console.warn('Tool-calling is not supported by the selected provider/model. Falling back to plain chat response.', error.message);
      const fallbackContent = await requestPlainAssistantReply(baseUrl, apiKey, [
        { role: "system", content: systemPrompt },
        ...conversationHistory
      ]);

      updateMessage(loadingId, fallbackContent, false);
      conversationHistory.push({
        role: "assistant",
        content: fallbackContent
      });
      return;
    }

    // Handle response based on whether tools were called
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Remove loading indicator (no partial text to show)
      removeMessage(loadingId);

      // Add assistant message with tool calls to history
      conversationHistory.push({
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls
      });

      // Execute tool calls and get STREAMING final response
      await executeToolCalls(message.tool_calls);
    } else {
      // No tool calls - got direct answer
      if (message.content) {
        // Update with final message
        updateMessage(loadingId, message.content, false);

        // Add to history
        conversationHistory.push({
          role: "assistant",
          content: message.content
        });
      } else {
        removeMessage(loadingId);
      }
    }

  } catch (error) {
    console.error('Error sending message:', error);
    removeMessage(loadingId);
    appendMessage('assistant', `❌ Error: ${error.message}`, false, 'error');
    bootstrapAlert({
      color: "danger",
      title: "LLM Error",
      body: error.message
    });
  }
}

/**
 * Execute tool calls and send results back to LLM
 */
async function executeToolCalls(toolCalls) {
  const toolResults = [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    let args = {};

    try {
      args = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error('Error parsing tool arguments:', e);
      args = {};
    }

    appendMessage('system', `🔧 Executing: ${toolName}`, false, 'tool');

    try {
      const result = await executeTool(toolName, args);

      toolResults.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: toolName,
        content: JSON.stringify(result)
      });

      appendMessage('system', `✅ ${toolName} completed`, false, 'tool');
    } catch (error) {
      console.error(`Error executing tool ${toolName}:`, error);
      toolResults.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: toolName,
        content: JSON.stringify({ error: error.message })
      });

      appendMessage('system', `❌ ${toolName} failed: ${error.message}`, false, 'tool-error');
    }
  }

  // Add tool results to history
  conversationHistory.push(...toolResults);

  // Get LLM's final response after tool execution
  await getContinuationResponse();
}

/**
 * Get continuation response from LLM after tool execution
 */
async function getContinuationResponse() {
  const loadingId = appendMessage('assistant', '...', true);

  try {
    const { baseUrl, apiKey } = await getChatConfig(false);
    const systemPrompt = buildSystemPrompt();

    const requestBody = {
      model: getModelName(),
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory
      ],
      stream: true
    };

    let assistantMessage = '';
    let lastUpdateTime = 0;
    const updateInterval = 50; // Update UI every 50ms max (20 FPS)

    try {
      for await (const chunk of asyncLLM(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
      })) {

        if (chunk.error) {
          throw new Error(chunk.error);
        }

        // asyncLLM returns chunks with {content, message} format
        // IMPORTANT: chunk.content contains FULL accumulated text, not delta!
        // Handle both formats: asyncLLM's simplified format and OpenAI's standard format
        let content = null;
        let finishReason = null;

        if (chunk.choices && chunk.choices.length > 0) {
          // Standard OpenAI format (delta - incremental content)
          const delta = chunk.choices[0].delta;
          if (delta?.content) {
            assistantMessage += delta.content;  // Accumulate deltas
            content = assistantMessage;
          }
          finishReason = chunk.choices[0].finish_reason;
        } else if (chunk.content !== undefined) {
          // asyncLLM simplified format (full accumulated content)
          content = chunk.content;  // Use directly, don't accumulate!
          assistantMessage = content;  // Store for history
          finishReason = chunk.message?.finish_reason;
        }

        if (content) {
          // Throttle UI updates for better performance
          const now = Date.now();
          if (now - lastUpdateTime > updateInterval || finishReason) {
            updateMessage(loadingId, content, false);
            lastUpdateTime = now;
          }
        }

        if (finishReason && finishReason === 'stop') {
          break;
        }
      }
    } catch (streamError) {
      console.warn('Streaming continuation failed, falling back to plain response.', streamError);
      try {
        assistantMessage = await requestPlainAssistantReply(baseUrl, apiKey, requestBody.messages);
      } catch (plainError) {
        console.warn('Native continuation failed, retrying with flattened transcript.', plainError);
        assistantMessage = await requestPlainAssistantReply(
          baseUrl,
          apiKey,
          buildToollessContinuationMessages(systemPrompt, conversationHistory)
        );
      }
    }

    // Final update to ensure all content is rendered
    if (assistantMessage) {
      updateMessage(loadingId, assistantMessage, false);
    }

    if (assistantMessage) {
      // Add final response to history
      conversationHistory.push({
        role: "assistant",
        content: assistantMessage
      });
    } else {
      removeMessage(loadingId);
      appendMessage('assistant', 'No response received from the model.', false, 'error');
    }

  } catch (error) {
    console.error('Error getting continuation:', error);
    removeMessage(loadingId);
    appendMessage('assistant', `❌ Error: ${error.message}`, false, 'error');
  }
}

/**
 * Execute a specific scenario-focused tool
 */
async function executeTool(toolName, args) {
  switch (toolName) {
    case 'interpret_scenario':
      return await dataContext.interpretScenario(args.scenario_id);

    case 'suggest_scenario':
      return await dataContext.suggestScenario(args.goal);

    case 'analyze_chart':
      return await dataContext.analyzeChart(args.chart_name);

    case 'compare_outcomes':
      return await dataContext.compareOutcomes(args.scenario_ids);

    case 'create_scenario':
      return await dataContext.createScenario(args);

    case 'query_segments':
      return await querySegments(args);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Query segments with filters
 */
async function querySegments(filters) {
  if (!window.segmentEngine) {
    throw new Error('Segmentation engine not available');
  }

  // Get all segments (filterSegments only handles acquisition/engagement/monetization)
  let segments = window.segmentEngine.filterSegments({});

  // Apply custom filters manually
  if (filters.tier && filters.tier !== 'all') {
    segments = segments.filter(seg => seg.tier === filters.tier);
  }

  if (filters.size && filters.size !== 'all') {
    segments = segments.filter(seg => {
      const count = parseInt(seg.customer_count) || 0;
      if (filters.size === 'small') return count < 1000;
      if (filters.size === 'medium') return count >= 1000 && count < 3000;
      if (filters.size === 'large') return count >= 3000;
      return true;
    });
  }

  if (filters.repeat_loss_risk && filters.repeat_loss_risk !== 'all') {
    segments = segments.filter(seg => {
      const repeatLoss = parseFloat(seg.repeat_loss_rate) || 0;
      if (filters.repeat_loss_risk === 'low') return repeatLoss < 0.10;
      if (filters.repeat_loss_risk === 'medium') return repeatLoss >= 0.10 && repeatLoss < 0.20;
      if (filters.repeat_loss_risk === 'high') return repeatLoss >= 0.20;
      return true;
    });
  }

  if (filters.value && filters.value !== 'all') {
    segments = segments.filter(seg => {
      const aov = parseFloat(seg.avg_order_value) || 0;
      if (filters.value === 'low') return aov < 28;
      if (filters.value === 'medium') return aov >= 28 && aov < 42;
      if (filters.value === 'high') return aov >= 42;
      return true;
    });
  }

  // Apply limit
  const limit = filters.limit || 10;
  segments = segments.slice(0, limit);

  // Format segment data for the LLM
  const segmentData = segments.map(seg => {
    const elasticity = window.segmentEngine.getElasticity(seg.tier, seg.compositeKey);
    const repeatLoss = parseFloat(seg.repeat_loss_rate) || 0;
    const aov = parseFloat(seg.avg_order_value) || 0;
    const customerCount = parseInt(seg.customer_count) || 0;

    return {
      composite_key: seg.compositeKey,
      tier: seg.tier,
      acquisition: seg.acquisition,
      engagement: seg.engagement,
      monetization: seg.monetization,
      customer_count: customerCount,
      repeat_loss_rate: (repeatLoss * 100).toFixed(2) + '%',
      avg_order_value: '$' + aov.toFixed(2),
      elasticity: elasticity?.toFixed(2) || 'N/A',
      segment_name: generateSegmentName(seg)
    };
  });

  return {
    total_segments: segmentData.length,
    filters_applied: filters,
    segments: segmentData,
    summary: `Found ${segmentData.length} segments matching the criteria.`
  };
}

/**
 * Generate a human-readable segment name
 */
function generateSegmentName(segment) {
  const acqMap = { low: 'Loyal', medium: 'Moderate', high: 'Deal-Seeking' };
  const engMap = { low: 'Casual', medium: 'Regular', high: 'Heavy' };
  const monMap = { low: 'At-Risk', medium: 'Stable', high: 'Premium' };

  const acq = acqMap[segment.acquisition] || segment.acquisition;
  const eng = engMap[segment.engagement] || segment.engagement;
  const mon = monMap[segment.monetization] || segment.monetization;

  return `${acq} ${eng} ${mon}`;
}

/**
 * Append a message to the chat UI
 */
function appendMessage(role, content, isLoading = false, customClass = '') {
  const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  uiMessages.push({ id: messageId, role, content, isLoading, customClass });
  renderAllChatFeeds();
  return messageId;
}

/**
 * Update an existing message
 */
function updateMessage(messageId, content, isLoading = false) {
  const target = uiMessages.find((message) => message.id === messageId);
  if (!target) return;
  target.content = content;
  target.isLoading = isLoading;
  renderAllChatFeeds();
}

/**
 * Remove a message from the UI
 */
function removeMessage(messageId) {
  const targetIndex = uiMessages.findIndex((message) => message.id === messageId);
  if (targetIndex !== -1) {
    uiMessages.splice(targetIndex, 1);
    renderAllChatFeeds();
  }
}

/**
 * Clear conversation history
 */
export function clearHistory() {
  conversationHistory = [];
  uiMessages = [];
  renderAllChatFeeds();
}

