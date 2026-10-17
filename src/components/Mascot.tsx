import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from 'react-native';

export type MascotState =
  | 'reading'
  | 'noTopics'
  | 'generating'
  | 'chat'
  | 'thinking'
  | 'happy'
  | 'completed'
  | 'reminder'
  | 'error';

const SOURCES: Record<MascotState, ImageSourcePropType> = {
  reading: require('../../assets/mascot/reading.png'),
  noTopics: require('../../assets/mascot/noTopics.png'),
  generating: require('../../assets/mascot/generating.png'),
  chat: require('../../assets/mascot/chat.png'),
  thinking: require('../../assets/mascot/thinking.png'),
  happy: require('../../assets/mascot/happy.png'),
  completed: require('../../assets/mascot/completed.png'),
  reminder: require('../../assets/mascot/reminder.png'),
  error: require('../../assets/mascot/error.png'),
};

const LABELS: Record<MascotState, string> = {
  reading: 'Panda reading a book',
  noTopics: 'Panda next to a small stack of books',
  generating: 'Panda dozing at a laptop while it works',
  chat: 'Panda chatting on a phone',
  thinking: 'Panda thinking',
  happy: 'Happy panda reading a book',
  completed: 'Content panda holding a finished book',
  reminder: 'Panda next to a ringing bell',
  error: 'Sad panda with a retry sign',
};

export const pandaIcon: ImageSourcePropType = require('../../assets/mascot/pandaIcon.png');

export interface MascotProps {
  state: MascotState;
  size?: number;
  style?: StyleProp<ImageStyle>;
}

export function Mascot({ state, size = 140, style }: MascotProps) {
  return (
    <Image
      source={SOURCES[state]}
      style={[{ width: size, height: size }, style]}
      resizeMode="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABELS[state]}
    />
  );
}
