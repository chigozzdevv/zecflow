export const NILLION_QUEUE = 'nillion-compute';
export const NILLION_JOB_NAME = 'execute-nada-program';

export function startNillionWorker() {
  return null as unknown as { close: () => Promise<void> };
}

export async function enqueueNillionJob(_jobId: string) {
  throw new Error('Nillion VM compute is disabled');
}
