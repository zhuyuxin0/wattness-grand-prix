// The towers: Timing screens (Atlas + CoinMarketCap), the Season purse (Flap) and License to launch (OpenFour).
import './towers.css';
import type { StationModule } from '../types';
import { timingFrame } from './timing';
import { seasonFrame } from './season';
import { launchFrame } from './launch';

export const frames: StationModule['frames'] = {
  'towers.T01-timing': (ctx) => timingFrame(ctx),
  'towers.T02-season': (ctx) => seasonFrame(ctx),
  'towers.T03-launch-blocked': (ctx) => launchFrame(ctx, 'blocked'),
  'towers.T04-launch-graduate': (ctx) => launchFrame(ctx, 'graduate'),
};
