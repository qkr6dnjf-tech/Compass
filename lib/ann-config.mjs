export const ANN_EPOCHS = 60;
export const ANN_PRESETS = [
  {id: '8', hiddenLayers: [8], label: '1층 · 8개 (기존)'},
  {id: '32-16', hiddenLayers: [32, 16], label: '2층 · 32 / 16개'},
  {id: '32-16-8', hiddenLayers: [32, 16, 8], label: '3층 · 32 / 16 / 8개'},
];
export const DEFAULT_ANN_LAYERS = [32, 16];
export const supportedArchitecture = value => Array.isArray(value) && ANN_PRESETS.some(p => p.hiddenLayers.length === value.length && p.hiddenLayers.every((n, i) => n === value[i]));
export const hiddenLayersFor = artifact => artifact?.trainingConfig?.annHiddenLayers || artifact?.model?.hiddenLayers || [8];
export const architectureLabel = artifact => hiddenLayersFor(artifact).join(' → ');
export const modelLabel = artifact => artifact?.report?.selectedAlgorithm === 'boost' ? '부스팅' : `ANN ${architectureLabel(artifact)}`;
export const parameterCount = hiddenLayers => [13, ...hiddenLayers, 1].slice(1).reduce((sum, n, i) => sum + ([13, ...hiddenLayers][i] + 1) * n, 0);
