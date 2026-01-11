import type { RuntimeState } from '../types';
import { resumeWithAIResponse, resumeWithUserInput } from '../state';
import { runUntilPause } from '../step';

// Create a mock AI runner that responds with predefined responses
export function createMockAIRunner(responses: Record<string, string> | string) {
  return function mockAI(state: RuntimeState): RuntimeState {
    if (state.status !== 'awaiting_ai') return state;

    const response =
      typeof responses === 'string'
        ? responses
        : responses[state.pendingAI?.prompt ?? ''] ?? 'mock response';

    return resumeWithAIResponse(state, response);
  };
}

// Create a mock user input runner
export function createMockUserRunner(responses: Record<string, string> | string) {
  return function mockUser(state: RuntimeState): RuntimeState {
    if (state.status !== 'awaiting_user') return state;

    const response =
      typeof responses === 'string'
        ? responses
        : responses[state.pendingAI?.prompt ?? ''] ?? 'mock input';

    return resumeWithUserInput(state, response);
  };
}

// Run a program with mock AI responses until completion or error
export function runWithMockAI(
  state: RuntimeState,
  mockResponse: string | Record<string, string>
): RuntimeState {
  const mockAI = createMockAIRunner(mockResponse);
  let current = runUntilPause(state);

  while (current.status === 'awaiting_ai') {
    current = mockAI(current);
    current = runUntilPause(current);
  }

  return current;
}

// Run a program with both mock AI and user responses
export function runWithMocks(
  state: RuntimeState,
  aiResponses: string | Record<string, string>,
  userResponses: string | Record<string, string>
): RuntimeState {
  const mockAI = createMockAIRunner(aiResponses);
  const mockUser = createMockUserRunner(userResponses);
  let current = runUntilPause(state);

  while (current.status === 'awaiting_ai' || current.status === 'awaiting_user') {
    if (current.status === 'awaiting_ai') {
      current = mockAI(current);
    } else {
      current = mockUser(current);
    }
    current = runUntilPause(current);
  }

  return current;
}
