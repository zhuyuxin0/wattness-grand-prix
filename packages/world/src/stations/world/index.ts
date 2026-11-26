// The world group's frames (STORYBOARD.md, Frames · World): Texas and its 316 batteries, the weather radar, race day.
import type { StationModule } from '../types';
import { texas } from './texas';
import { radar } from './radar';
import { raceDay } from './race-day';

export const frames: StationModule['frames'] = {
  'world.W01-texas': texas,
  'world.W02-radar': radar,
  'world.W03-race-day': raceDay,
};
