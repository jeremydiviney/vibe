// AI Interaction Logging Utilities
// Formats AI interactions from runtime state for debugging and analysis

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RuntimeState, AIInteraction, FrameEntry } from './types';
import { buildSystemMessage, buildToolSystemMessage } from './ai/formatters';

const LOG_DIR = '.ai-logs';
const MAX_LOGS = 20;

/**
 * Find prompt entries from all frames in order.
 */
function getPromptEntries(state: RuntimeState): Array<FrameEntry & { kind: 'prompt' }> {
  const prompts: Array<FrameEntry & { kind: 'prompt' }> = [];
  for (const frame of state.callStack) {
    for (const entry of frame.orderedEntries) {
      if (entry.kind === 'prompt') {
        prompts.push(entry);
      }
    }
  }
  return prompts;
}

/**
 * Format a single AI interaction as markdown.
 * Uses the prompt entry from state for tool calls, and AIInteraction for metadata.
 */
function formatInteraction(
  interaction: AIInteraction,
  promptEntry: (FrameEntry & { kind: 'prompt' }) | undefined,
  state: RuntimeState,
  index: number
): string {
  const lines: string[] = [];

  // Header
  lines.push(`## Interaction ${index + 1}`);
  lines.push(`**Type:** ${interaction.type} | **Model:** ${interaction.model} | **Target:** ${interaction.targetType ?? 'text'}`);
  lines.push('');

  // System message
  lines.push('### Messages Sent to Model');
  lines.push('');
  lines.push('**[system]**');
  lines.push(buildSystemMessage());
  lines.push('');

  // Tools system message (if tools are registered)
  const toolSchemas = state.toolRegistry.getSchemas();
  if (toolSchemas.length > 0) {
    lines.push('**[system]**');
    lines.push(buildToolSystemMessage(toolSchemas));
    lines.push('');
  }

  // User prompt
  lines.push('**[user]**');
  lines.push(interaction.prompt);
  lines.push('');

  // Tool calls (from prompt entry in state)
  if (promptEntry?.toolCalls && promptEntry.toolCalls.length > 0) {
    lines.push('### Tool Calls');
    lines.push('');
    for (const call of promptEntry.toolCalls) {
      lines.push(`- \`${call.toolName}(${JSON.stringify(call.args)})\``);
      if (call.error) {
        lines.push(`  → Error: ${call.error}`);
      } else if (call.result !== undefined) {
        const resultStr = typeof call.result === 'string'
          ? call.result
          : JSON.stringify(call.result, null, 2);
        lines.push(`  → ${resultStr}`);
      }
    }
    lines.push('');
  }

  // Response
  lines.push('### Response');
  lines.push('```');
  if (typeof interaction.response === 'string') {
    lines.push(interaction.response);
  } else {
    lines.push(JSON.stringify(interaction.response, null, 2));
  }
  lines.push('```');

  // Metadata
  if (interaction.usage || interaction.durationMs) {
    lines.push('');

    // Token usage
    if (interaction.usage) {
      const { inputTokens, outputTokens, cachedInputTokens, cacheCreationTokens, thinkingTokens } = interaction.usage;
      let tokenStr = `**Tokens:** ${inputTokens} in`;
      if (cachedInputTokens) {
        tokenStr += ` (${cachedInputTokens} cached)`;
      }
      if (cacheCreationTokens) {
        tokenStr += ` (${cacheCreationTokens} cache write)`;
      }
      tokenStr += ` / ${outputTokens} out`;
      if (thinkingTokens) {
        tokenStr += ` (${thinkingTokens} thinking)`;
      }
      lines.push(tokenStr);
    }

    // Duration
    if (interaction.durationMs) {
      lines.push(`**Duration:** ${interaction.durationMs}ms`);
    }
  }

  return lines.join('\n');
}

/**
 * Format all AI interactions as markdown from runtime state.
 */
export function formatAIInteractions(state: RuntimeState): string {
  const interactions = state.aiInteractions;
  if (interactions.length === 0) {
    return 'No AI interactions recorded.';
  }

  // Get prompt entries from state to match with interactions
  const promptEntries = getPromptEntries(state);

  // Collect unique models used
  const modelsUsed = new Map<string, { name: string; provider: string; url?: string; thinkingLevel?: string }>();
  for (const interaction of interactions) {
    if (interaction.modelDetails && !modelsUsed.has(interaction.model)) {
      modelsUsed.set(interaction.model, interaction.modelDetails);
    }
  }

  // Build header with model info
  const headerLines = [
    '# AI Interaction Log',
    '',
    `Total interactions: ${interactions.length}`,
  ];

  if (modelsUsed.size > 0) {
    headerLines.push('');
    headerLines.push('## Models Used');
    for (const [varName, details] of modelsUsed) {
      let modelLine = `- **${varName}**: \`${details.name}\` via ${details.provider}`;
      if (details.url) {
        modelLine += ` @ ${details.url}`;
      }
      if (details.thinkingLevel) {
        modelLine += ` (thinking: ${details.thinkingLevel})`;
      }
      headerLines.push(modelLine);
    }
  }

  headerLines.push('');
  headerLines.push('---');
  headerLines.push('');

  const header = headerLines.join('\n');

  // Format each interaction, matching with prompt entries by prompt text
  const formatted = interactions.map((interaction, i) => {
    // Find matching prompt entry by prompt text
    const matchingPrompt = promptEntries.find(p => p.prompt === interaction.prompt);
    return formatInteraction(interaction, matchingPrompt, state, i);
  });

  return header + formatted.join('\n\n---\n\n');
}

/**
 * Dump AI interactions to console in a readable format.
 */
export function dumpAIInteractions(state: RuntimeState): void {
  console.log('\n' + '='.repeat(60));
  console.log('AI INTERACTION LOG');
  console.log('='.repeat(60) + '\n');
  console.log(formatAIInteractions(state));
  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Save AI interactions to a file in the log directory.
 * Automatically rotates logs to keep only the last MAX_LOGS files.
 */
export function saveAIInteractions(state: RuntimeState, projectRoot?: string): string | null {
  if (state.aiInteractions.length === 0) {
    return null;
  }

  const logDir = projectRoot ? join(projectRoot, LOG_DIR) : LOG_DIR;

  // Ensure log directory exists
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `ai-log-${timestamp}.md`;
  const filepath = join(logDir, filename);

  // Write the log
  const content = formatAIInteractions(state);
  writeFileSync(filepath, content, 'utf-8');

  // Rotate logs - keep only the last MAX_LOGS
  rotateLogFiles(logDir);

  return filepath;
}

/**
 * Remove old log files to keep only the last MAX_LOGS.
 */
function rotateLogFiles(logDir: string): void {
  const files = readdirSync(logDir)
    .filter(f => f.startsWith('ai-log-') && f.endsWith('.md'))
    .sort()
    .reverse(); // Newest first (ISO timestamp sorts correctly)

  // Remove files beyond MAX_LOGS
  const toDelete = files.slice(MAX_LOGS);
  for (const file of toDelete) {
    unlinkSync(join(logDir, file));
  }
}
