// AI Interaction Logging Utilities
// Formats AI interactions for debugging and analysis

import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { AIInteraction } from './types';

const LOG_DIR = '.ai-logs';
const MAX_LOGS = 20;

/**
 * Format a single AI interaction as markdown.
 */
function formatInteraction(interaction: AIInteraction, index: number): string {
  const lines: string[] = [];

  // Header
  lines.push(`## Interaction ${index + 1}`);
  lines.push(`**Type:** ${interaction.type} | **Model:** ${interaction.model} | **Target:** ${interaction.targetType ?? 'text'}`);
  lines.push('');

  // Messages sent to model
  lines.push('### Messages Sent to Model');
  lines.push('');

  for (const msg of interaction.messages) {
    lines.push(`**[${msg.role}]**`);
    lines.push(msg.content);
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
 * Format all AI interactions as markdown for Claude to read.
 */
export function formatAIInteractions(interactions: AIInteraction[]): string {
  if (interactions.length === 0) {
    return 'No AI interactions recorded.';
  }

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
  const formatted = interactions.map((interaction, i) => formatInteraction(interaction, i));

  return header + formatted.join('\n\n---\n\n');
}

/**
 * Dump AI interactions to console in a readable format.
 */
export function dumpAIInteractions(interactions: AIInteraction[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('AI INTERACTION LOG');
  console.log('='.repeat(60) + '\n');
  console.log(formatAIInteractions(interactions));
  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * Save AI interactions to a file in the log directory.
 * Automatically rotates logs to keep only the last MAX_LOGS files.
 */
export function saveAIInteractions(interactions: AIInteraction[], projectRoot?: string): string | null {
  if (interactions.length === 0) {
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
  const content = formatAIInteractions(interactions);
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
