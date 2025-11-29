import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Signer } from '@nillion/nuc';
import { SecretVaultUserClient } from '@nillion/secretvaults';
import { NILLION_NILDB_URLS } from '@/config/nillion';

type NillionUserContextValue = {
  client: SecretVaultUserClient | null;
  did: string | null;
  initializing: boolean;
  connect: () => Promise<void>;
};

const NillionUserContext = createContext<NillionUserContextValue | undefined>(undefined);

export function NillionUserProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SecretVaultUserClient | null>(null);
  const [did, setDid] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('Ethereum provider not available');
    }

    setInitializing(true);
    try {
      const provider = (window as any).ethereum;
      const signer = await Signer.fromEip1193Provider(provider);
      const userClient = await SecretVaultUserClient.from({
        signer,
        baseUrls: NILLION_NILDB_URLS,
        blindfold: { operation: 'store' },
      });
      const didObj = await userClient.getDid();
      setClient(userClient);
      setDid(didObj.didString);
    } finally {
      setInitializing(false);
    }
  }, []);

  const value = useMemo(
    () => ({ client, did, initializing, connect }),
    [client, did, initializing, connect],
  );

  return <NillionUserContext.Provider value={value}>{children}</NillionUserContext.Provider>;
}

export function useNillionUser() {
  const ctx = useContext(NillionUserContext);
  if (!ctx) {
    throw new Error('useNillionUser must be used within NillionUserProvider');
  }
  return ctx;
}
