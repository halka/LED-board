export const state = {
  running: true,
  lastTime: performance.now(),
  recorderBusy: false,
  nextLayerId: 1,
  drag: null,
  selectedLayerId: null,
  layers: []
};
