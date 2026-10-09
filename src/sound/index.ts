import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type SoundName = 'tap' | 'click' | 'streak';

const SOURCES: Record<SoundName, number> = {
  tap: require('../../assets/sounds/tap.m4a'),
  click: require('../../assets/sounds/click.m4a'),
  streak: require('../../assets/sounds/streak.m4a'),
};

const VOLUME: Record<SoundName, number> = { tap: 0.35, click: 0.35, streak: 0.5 };

let enabled = true;
let modeReady: Promise<void> | null = null;
const players: Partial<Record<SoundName, AudioPlayer>> = {};

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

// Ambient, mixable session: never pauses or ducks the user's own audio, and stays
// quiet when the phone is on silent.
function ensureMode(): Promise<void> {
  modeReady ??= setAudioModeAsync({
    playsInSilentMode: false,
    interruptionMode: 'mixWithOthers',
    shouldPlayInBackground: false,
  }).catch(() => undefined);
  return modeReady;
}

function getPlayer(name: SoundName): AudioPlayer {
  let player = players[name];
  if (!player) {
    player = createAudioPlayer(SOURCES[name]);
    player.volume = VOLUME[name];
    players[name] = player;
  }
  return player;
}

async function play(name: SoundName): Promise<void> {
  await ensureMode();
  if (!enabled) return;
  const player = getPlayer(name);
  await player.seekTo(0);
  player.play();
}

export function playSound(name: SoundName): void {
  if (!enabled) return;
  play(name).catch(() => undefined);
}
