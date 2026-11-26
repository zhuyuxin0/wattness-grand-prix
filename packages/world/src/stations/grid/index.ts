// The grid group's frames: the starting grid, Parc fermé, the stewards and the standings (STORYBOARD.md R01 to R04).
// grid.R03-pass is the stewards' bay checking the sealed copy (every check passes), the story's check before the tamper.
import type { StationModule } from '../types';
import { r01 } from './r01';
import { r02 } from './r02';
import { r03 } from './r03';
import { r04 } from './r04';

export const frames: StationModule['frames'] = {
  'grid.R01': r01,
  'grid.R02': r02,
  'grid.R03': (ctx) => r03(ctx, 'changed'),
  'grid.R03-pass': (ctx) => r03(ctx, 'sealed'),
  'grid.R04': r04,
};
