import { StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { IconButton } from '../Button';

const MINUTE_STEP = 15;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

// 'HH:MM' shifted by whole hours and minutes, wrapping around midnight.
export function shiftTime(value: string, hours: number, minutes: number): string {
  const [h = 0, m = 0] = value.split(':').map((part) => Number(part) || 0);
  const nextH = (((h + hours) % 24) + 24) % 24;
  const nextM = (((m + minutes) % 60) + 60) % 60;
  return `${pad(nextH)}:${pad(nextM)}`;
}

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function TimeStepper({ label, value, onChange }: Props) {
  const { spacing } = useTheme();
  const [hour = '00', minute = '00'] = value.split(':');
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="caption">{label}</AppText>
      <View style={styles.row} accessibilityLabel={`${label}: ${value}`}>
        <IconButton icon="remove" label={`${label}: one hour earlier`} onPress={() => onChange(shiftTime(value, -1, 0))} />
        <AppText variant="heading" style={styles.digits}>
          {hour}
        </AppText>
        <IconButton icon="add" label={`${label}: one hour later`} onPress={() => onChange(shiftTime(value, 1, 0))} />
        <AppText variant="heading" style={{ paddingHorizontal: spacing.sm }}>
          :
        </AppText>
        <IconButton
          icon="remove"
          label={`${label}: ${MINUTE_STEP} minutes earlier`}
          onPress={() => onChange(shiftTime(value, 0, -MINUTE_STEP))}
        />
        <AppText variant="heading" style={styles.digits}>
          {minute}
        </AppText>
        <IconButton
          icon="add"
          label={`${label}: ${MINUTE_STEP} minutes later`}
          onPress={() => onChange(shiftTime(value, 0, MINUTE_STEP))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  digits: { minWidth: 32, textAlign: 'center', fontFamily: fonts.semiBold },
});
