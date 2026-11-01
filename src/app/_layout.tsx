import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LogBox } from 'react-native';
import { UpdatePrompt } from '@/components/update-prompt';

LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  '[GinnipalService]',
]);

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Slot />
      <UpdatePrompt />
    </SafeAreaProvider>
  );
}
