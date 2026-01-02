import type { RegisteredTool, ToolRegistry, ToolSchema } from './types';
import { builtinTools } from './builtin';

/**
 * Create a new tool registry.
 * Tools are stored in a Map for O(1) lookup.
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, RegisteredTool>();

  return {
    register(tool: RegisteredTool): void {
      // Allow overwriting existing tools (user tools can shadow builtins)
      tools.set(tool.name, tool);
    },

    get(name: string): RegisteredTool | undefined {
      return tools.get(name);
    },

    has(name: string): boolean {
      return tools.has(name);
    },

    list(): RegisteredTool[] {
      return Array.from(tools.values());
    },

    getSchemas(): ToolSchema[] {
      return Array.from(tools.values()).map((t) => t.schema);
    },
  };
}

/**
 * Create a tool registry pre-populated with built-in tools.
 */
export function createToolRegistryWithBuiltins(): ToolRegistry {
  const registry = createToolRegistry();
  for (const tool of builtinTools) {
    registry.register(tool);
  }
  return registry;
}
