import type { AuthProvider } from './types';

export function getAuthProvider(): AuthProvider {
  const provider = process.env.AUTH_PROVIDER || 'replit';
  switch (provider) {
    case 'replit': {
      const { ReplitAuthProvider } = require('./replit-auth');
      return new ReplitAuthProvider();
    }
    case 'local': {
      const { LocalAuthProvider } = require('./local-auth');
      return new LocalAuthProvider();
    }
    default:
      throw new Error(`Unknown AUTH_PROVIDER: ${provider}`);
  }
}

export type { AuthProvider } from './types';
