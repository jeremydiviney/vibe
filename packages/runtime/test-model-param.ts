import { parse } from './src/parser/parse';
import { createInitialState, currentFrame } from './src/runtime/state';
import { step } from './src/runtime/step';

// Simulate getModelValue from ai-provider.ts (uses vibeType on VibeValue wrapper)
function getModelValue(state: any, modelName: string): any {
  // Search through all frames for the model
  for (let i = state.callStack.length - 1; i >= 0; i--) {
    const frame = state.callStack[i];
    const variable = frame.locals[modelName];
    console.log(`  Checking frame ${i} (${frame.name}) for '${modelName}':`, variable ? 'found' : 'not found');
    if (variable) {
      console.log(`    variable.value:`, variable.value);
      console.log(`    vibeType:`, variable.vibeType);
    }
    if (variable?.vibeType === 'model' && variable.value) {
      return variable.value;
    }
  }
  return null;
}

const code = `
model myModel = {
  name: "test",
  apiKey: "key",
  provider: "openai"
}

const models = [myModel]

function getModel() {
  return models[0]
}

function useModel(m: model): text {
  return do "test" m
}

const guesser = getModel()
let result = useModel(guesser)
`;

const ast = parse(code);
let state = createInitialState(ast);

// Run until we hit awaiting_ai
while (state.status === 'running') {
  state = step(state);
}

console.log('Status:', state.status);
console.log('Model name in pendingAI:', state.pendingAI?.model);
console.log('');

// Simulate what getModelValue does
console.log('Simulating getModelValue lookup:');
const modelValue = getModelValue(state, state.pendingAI?.model || '');
console.log('');
console.log('Found model:', modelValue ? 'YES' : 'NO');
