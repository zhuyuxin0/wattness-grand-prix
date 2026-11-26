// @ts-nocheck
// Colours for chapters 04 and 05, per theme. The chrome and accents are the Terminal's (chrome.css,
// wattness-terminal-tokens.css); the scene's line art is our own, flat fills with thin edges. The intro plays in the
// dark (IntroScroller); the light values are kept for the harness.
//
// Dark, 28 Oct: one blue-grey family for everything built (pads a step off the ground, structures one tone, our
// battery's enclosures the brightest thing on the ground), so the accents carry the picture. Line keys, validated
// with the dataviz validator (dark, all pairs, surface #212c38): 34.5 kV #6f8fe0 against the flows' teal #2ec7a6 and
// orange #eb6834 (worst normal-vision dE 20.5, CVD dE 13.3); the layer's threads, prices #b481f0 and forecasts
// #d9c241, against teal and orange (worst normal dE 18.2, CVD dE 12.3). The lightness-band check fails only on the
// Terminal's own teal, orange and purple tokens.
export const PAL = {
  dark: {
    pad: '#26313e', padSide: '#18202a', padEdge: '#3a4757',
    yard: '#2c3846', fence: '#56677a', block: '#2b3745',
    asset: '#a9b5c2', assetEdge: '#56667a', roof: '#c3ccd6', dark: '#4a5767',
    city: '#8f9cab', cityEdge: '#4f5e71', cityRoof: '#aab5c1', tower: '#c2cbd5', park: '#26383a',
    panel: '#1d3149', panelEdge: '#3f5876', panelStow: '#1a2a3e',
    turbine: '#cfd6de', turbineEdge: '#6b7b8f',
    encl: '#dde3ea', enclEdge: '#6c7c90', skid: '#33404e',
    stack: '#b7c1cc', glow: '#eb6834',
    l345: '#c6cfd9', l138: '#7c8999', lmv: '#6f8fe0',
    teal: '#2ec7a6', orange: '#eb6834', gas: '#d9b48f',
    text: '#d7d9d4', muted: '#969ca3', chrome: '#101315', raised: '#1f2429',
    window: '#f3c77a',
    // chart tokens (dark): wind, solar, load, day-ahead price, real-time above day-ahead
    chWind: '#2aa5b4', chSolar: '#deca27', chLoad: '#227eb5', chDa: '#b481f0', chDartRt: '#f4a101',
    price: '#b481f0', forecast: '#d9c241',
    exch: '#eb6834', shadow: 0.36,
  },
  light: {
    pad: '#e6e8eb', padSide: '#b9bfc7', padEdge: '#a3aab4',
    yard: '#d6d9de', fence: '#7d848c', block: '#dcdfe3',
    asset: '#ffffff', assetEdge: '#5b6470', roof: '#ffffff', dark: '#8a929c',
    city: '#f4f5f7', cityEdge: '#6b7380', cityRoof: '#ffffff', tower: '#ffffff', park: '#dfe6df',
    panel: '#5f7898', panelEdge: '#3f4d60', panelStow: '#7d90a8',
    turbine: '#ffffff', turbineEdge: '#5b6470',
    encl: '#ffffff', enclEdge: '#5b6470', skid: '#59626d',
    stack: '#e9ecef', glow: '#eb6834',
    l345: '#3a4048', l138: '#8b939c', lmv: '#4f6fc4',
    teal: '#1fae8f', orange: '#e35f2a', gas: '#b48654',
    text: '#1a1a1a', muted: '#636a75', chrome: '#f3f4f6', raised: '#ffffff',
    window: '#d99a3a',
    chWind: '#098a7f', chSolar: '#948d06', chLoad: '#0490d8', chDa: '#6345b1', chDartRt: '#da6717',
    price: '#6345b1', forecast: '#948d06',
    exch: '#e35f2a', shadow: 0.2,
  },
};
