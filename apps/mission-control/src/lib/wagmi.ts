import { http, createConfig } from 'wagmi';
import { base, baseSepolia, mainnet } from 'wagmi/chains';
import { injected, coinbaseWallet } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [base, baseSepolia, mainnet],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'ClawHalla Mission Control' }),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
  },
});
