import { redirect } from 'next/navigation';
import { getSetting } from '@/lib/settings';

export default function RootPage() {
  const done = getSetting('onboarding_complete');
  const hasEnvToken = !!(process.env.GATEWAY_TOKEN);
  if (!done && !hasEnvToken) {
    redirect('/onboarding');
  }
  redirect('/dashboard');
}
