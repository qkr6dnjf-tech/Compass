import {ANN_EPOCHS, supportedArchitecture} from './ann-config.mjs';
import {need} from './domain.mjs';

const sigmoid = x => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
const normalize = (x, scaler) => x.map((v, j) => Math.max(-8, Math.min(8, (v - scaler[j].mean) / scaler[j].std)));

// Deterministic Xavier initialization; the same input/architecture gives the same fit.
function randomGenerator() {
  let state = 20261105;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function trainDenseANN(rows, scaler, hiddenLayers, {resume = null, epochs = ANN_EPOCHS} = {}) {
  need(supportedArchitecture(hiddenLayers), 'INVALID_ANN_ARCHITECTURE', '지원하는 ANN 은닉층 구성을 선택하세요.');
  const sizes = [scaler.length, ...hiddenLayers, 1], random = randomGenerator();
  const layers = resume ? resume.layers.map(l => ({...l, weights: Float64Array.from(l.weights), biases: Float64Array.from(l.biases)})) : sizes.slice(1).map((output, l) => {
    const input = sizes[l], scale = Math.sqrt(6 / (input + output));
    return {input, output, weights: Float64Array.from({length: input * output}, () => (random() * 2 - 1) * scale), biases: new Float64Array(output)};
  });
  const x = rows.map(r => Float64Array.from(normalize(r.x, scaler)));
  const positive = rows.filter(r => r.y).length, classWeight = Math.min(30, (rows.length - positive) / positive);
  need(positive > 0 && positive < rows.length, 'INSUFFICIENT_LABELS', 'ANN 학습에 양성·음성 표본이 모두 필요합니다.');
  const activation = sizes.map(n => new Float64Array(n));
  const delta = layers.map(l => new Float64Array(l.output));
  const gradW = layers.map(l => new Float64Array(l.weights.length)), gradB = layers.map(l => new Float64Array(l.output));
  const last = layers.length - 1, lr = 0.09 / rows.length;
  const completedEpochs = Math.min(ANN_EPOCHS, (resume?.completedEpochs || 0) + epochs);
  for (let epoch = resume?.completedEpochs || 0; epoch < completedEpochs; epoch++) {
    gradW.forEach(g => g.fill(0)); gradB.forEach(g => g.fill(0));
    for (let row = 0; row < rows.length; row++) {
      activation[0] = x[row];
      for (let l = 0; l <= last; l++) {
        const layer = layers[l], previous = activation[l], current = activation[l + 1];
        for (let i = 0; i < layer.output; i++) {
          let value = layer.biases[i];
          const offset = i * layer.input;
          for (let j = 0; j < layer.input; j++) value += layer.weights[offset + j] * previous[j];
          current[i] = l === last ? sigmoid(value) : Math.tanh(value);
        }
      }
      delta[last][0] = (activation[last + 1][0] - rows[row].y) * (rows[row].y ? classWeight : 1);
      for (let l = last - 1; l >= 0; l--) {
        const next = layers[l + 1];
        for (let i = 0; i < layers[l].output; i++) {
          let value = 0;
          for (let k = 0; k < next.output; k++) value += next.weights[k * next.input + i] * delta[l + 1][k];
          delta[l][i] = value * (1 - activation[l + 1][i] ** 2);
        }
      }
      for (let l = 0; l <= last; l++) {
        const layer = layers[l];
        for (let i = 0; i < layer.output; i++) {
          gradB[l][i] += delta[l][i];
          const offset = i * layer.input;
          for (let j = 0; j < layer.input; j++) gradW[l][offset + j] += delta[l][i] * activation[l][j];
        }
      }
    }
    for (let l = 0; l <= last; l++) {
      const layer = layers[l];
      for (let i = 0; i < layer.weights.length; i++) layer.weights[i] -= lr * gradW[l][i] + 0.0005 * layer.weights[i];
      for (let i = 0; i < layer.output; i++) layer.biases[i] -= lr * gradB[l][i];
    }
  }
  return {type: 'ann', format: 'dense-v2', hiddenLayers: [...hiddenLayers], epochs: ANN_EPOCHS, completedEpochs, activation: 'tanh', outputActivation: 'sigmoid', scaler, layers: layers.map(l => ({...l, weights: Array.from(l.weights), biases: Array.from(l.biases)}))};
}

export function scoreDenseANN(model, features) {
  let previous = normalize(features, model.scaler);
  for (let l = 0; l < model.layers.length; l++) {
    const layer = model.layers[l], current = new Array(layer.output);
    for (let i = 0; i < layer.output; i++) {
      let value = layer.biases[i];
      for (let j = 0; j < layer.input; j++) value += layer.weights[i * layer.input + j] * previous[j];
      current[i] = l === model.layers.length - 1 ? sigmoid(value) : Math.tanh(value);
    }
    previous = current;
  }
  return previous[0];
}

export function validDenseANN(model, inputSize) {
  if (model.format !== 'dense-v2' || !supportedArchitecture(model.hiddenLayers) || model.epochs !== ANN_EPOCHS || (model.completedEpochs !== undefined && model.completedEpochs !== ANN_EPOCHS) || model.activation !== 'tanh' || model.outputActivation !== 'sigmoid') return false;
  const sizes = [inputSize, ...model.hiddenLayers, 1];
  return Array.isArray(model.layers) && model.layers.length === sizes.length - 1 && model.layers.every((l, i) => l.input === sizes[i] && l.output === sizes[i + 1] && Array.isArray(l.weights) && l.weights.length === l.input * l.output && l.weights.every(Number.isFinite) && Array.isArray(l.biases) && l.biases.length === l.output && l.biases.every(Number.isFinite));
}
