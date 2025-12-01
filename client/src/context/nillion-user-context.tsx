import { createContext, useCallback, useContext, useMemo, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { Signer } from '@nillion/nuc';
import { SecretVaultUserClient } from '@nillion/secretvaults';
import { NILLION_NILDB_URLS } from '@/config/nillion';

type NillionUserContextValue = {
  client: SecretVaultUserClient | null;
  did: string | null;
  initializing: boolean;
  connect: () => Promise<void>;
  setDelegationToken: (token: string) => Promise<SecretVaultUserClient>;
};

const NillionUserContext = createContext<NillionUserContextValue | undefined>(undefined);

export function NillionUserProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SecretVaultUserClient | null>(null);
  const [did, setDid] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(false);
  const signerRef = useRef<any>(null);

  const connect = useCallback(async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      throw new Error('Ethereum provider not available');
    }

    setInitializing(true);
    try {
      const provider = (window as any).ethereum;
      const signer = await Signer.fromEip1193Provider(provider);
      signerRef.current = signer;
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

  const setDelegationToken = useCallback(async (token: string): Promise<SecretVaultUserClient> => {
    if (!signerRef.current) {
      throw new Error('Must connect wallet first');
    }
    const userClient = await SecretVaultUserClient.from({
      signer: signerRef.current,
      baseUrls: NILLION_NILDB_URLS,
      blindfold: { operation: 'store' },
      delegationToken: token,
    });
    const didObj = await userClient.getDid();
    setClient(userClient);
    setDid(didObj.didString);
    return userClient;
  }, []);

  const value = useMemo(
    () => ({ client, did, initializing, connect, setDelegationToken }),
    [client, did, initializing, connect, setDelegationToken],
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
