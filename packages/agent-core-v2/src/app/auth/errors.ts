import { registerErrorDomain, type ErrorDomain } from '#/_base/errors/codes';

export const AuthErrors = {
  codes: {
    AUTH_TOKEN_MISSING: 'auth.token_missing',
  },
  info: {
    'auth.token_missing': {
      title: 'Provider credential missing',
      retryable: false,
      public: true,
      action: 'Configure an API key for the provider.',
    },
  },
} as const satisfies ErrorDomain;

registerErrorDomain(AuthErrors);
