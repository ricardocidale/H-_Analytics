import type { AuthProvider } from './types';
import { ReplitAuthProvider } from './replit-auth';
import { LocalAuthProvider } from './local-auth';

export function getAuthProvider(): AuthProvider {
  const provider = process.env.AUTH_PROVIDER || 'replit';
  switch (provider) {
    case 'replit':
      return new ReplitAuthProvider();
    case 'local':
      return new LocalAuthProvider();
    default:
      throw new Error(`Unknown AUTH_PROVIDER: ${provider}`);
  }
}

export type { AuthProvider } from './types';
