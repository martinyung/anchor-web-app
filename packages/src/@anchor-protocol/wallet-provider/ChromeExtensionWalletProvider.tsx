import type { HumanAddr } from '@anchor-protocol/types/contracts';
import { extensionFixer } from '@anchor-protocol/wallet-provider/extensionFixer';
import { AccAddress, Extension } from '@terra-money/terra.js';
import { getParser } from 'bowser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StationNetworkInfo, WalletStatus } from './types';
import { WalletContext, WalletProviderProps, WalletState } from './useWallet';

const storage = localStorage;

const WALLET_ADDRESS: string = '__anchor_terra_station_wallet_address__';

async function intervalCheck(
  count: number,
  fn: () => boolean,
  intervalMs: number = 500,
): Promise<boolean> {
  let i: number = -1;
  while (++i < count) {
    if (fn()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

export function ChromeExtensionWalletProvider({
  children,
  defaultNetwork,
  enableWatchConnection = true,
}: WalletProviderProps) {
  const isChrome = useMemo(() => {
    const browser = getParser(navigator.userAgent);
    return browser.satisfies({
      chrome: '>60',
      edge: '>80',
    });
  }, []);

  const extension = useMemo(() => {
    const extension = new Extension();
    return extensionFixer(extension);
  }, []);

  const [status, setStatus] = useState<WalletStatus>(() => ({
    status: isChrome ? 'initializing' : 'unavailable',
    network: defaultNetwork,
  }));

  const watchConnection = useRef<boolean>(enableWatchConnection);

  const firstCheck = useRef<boolean>(false);

  const checkStatus = useCallback(
    async (watingExtensionScriptInjection: boolean = false) => {
      if (!isChrome) {
        return;
      }

      if (!watingExtensionScriptInjection && !firstCheck.current) {
        return;
      }

      const isExtensionInstalled = watingExtensionScriptInjection
        ? await intervalCheck(20, () => extension.isAvailable())
        : extension.isAvailable();

      firstCheck.current = true;

      if (!isExtensionInstalled) {
        setStatus((prev) => {
          if (
            prev.status !== 'initializing' &&
            prev.status !== 'not_installed'
          ) {
            console.error(
              [
                `Abnormal Wallet status change to not_install`,
                `===============================================`,
                JSON.stringify(
                  {
                    'window.isTerraExtensionAvailable':
                      window.isTerraExtensionAvailable,
                  },
                  null,
                  2,
                ),
              ].join('\n'),
            );
          }

          return prev.status !== 'not_installed'
            ? { status: 'not_installed', network: defaultNetwork }
            : prev;
        });
        return;
      }

      const infoPayload = await extension.info();

      const network: StationNetworkInfo = (infoPayload ??
        defaultNetwork) as any;

      if (watchConnection.current) {
        const storedWalletAddress: string | null = storage.getItem(
          WALLET_ADDRESS,
        );

        if (storedWalletAddress && AccAddress.validate(storedWalletAddress)) {
          const connectResult = await extension.connect();

          if (
            connectResult?.address &&
            AccAddress.validate(connectResult.address) &&
            connectResult.address !== storedWalletAddress
          ) {
            storage.setItem(WALLET_ADDRESS, connectResult.address);
          }

          setStatus((prev) => {
            return prev.status !== 'ready' ||
              prev.walletAddress !== connectResult.address
              ? {
                  status: 'ready',
                  network,
                  walletAddress: connectResult.address as HumanAddr,
                }
              : prev;
          });
        } else {
          if (storedWalletAddress) {
            storage.removeItem(WALLET_ADDRESS);
          }

          setStatus((prev) => {
            return prev.status !== 'not_connected'
              ? { status: 'not_connected', network }
              : prev;
          });
        }
      } else {
        setStatus((prev) => {
          return prev.status !== 'not_connected'
            ? { status: 'not_connected', network }
            : prev;
        });
      }
    },
    [defaultNetwork, extension, isChrome],
  );

  const install = useCallback(() => {
    window.open(
      'https://chrome.google.com/webstore/detail/terra-station/aiifbnbfobpmeekipheeijimdpnlpgpp',
      '_blank',
    );
  }, []);

  const connect = useCallback(async () => {
    const result = await extension.connect();

    if (result?.address) {
      const walletAddress: string = result.address;
      storage.setItem(WALLET_ADDRESS, walletAddress);

      await checkStatus();
    }
  }, [checkStatus, extension]);

  const disconnect = useCallback(() => {
    storage.removeItem(WALLET_ADDRESS);
    checkStatus();
  }, [checkStatus]);

  const post = useCallback<WalletState['post']>(
    (data) => {
      return extension.post(data);
    },
    [extension],
  );

  useEffect(() => {
    if (isChrome) {
      checkStatus(true);
    }
  }, [checkStatus, isChrome]);

  const state = useMemo<WalletState>(
    () => ({
      status,
      install,
      connect,
      disconnect,
      post,
      checkStatus,
    }),
    [checkStatus, connect, disconnect, install, post, status],
  );

  return (
    <WalletContext.Provider value={state}>
      {typeof children === 'function' ? children(state) : children}
    </WalletContext.Provider>
  );
}