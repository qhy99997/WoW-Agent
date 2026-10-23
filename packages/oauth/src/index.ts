export type { DeviceHeaders } from './types';

export {
  assertHostIdentity,
  createDefaultHeaders,
  createDeviceHeaders,
  createDeviceId,
  createUserAgent,
  parseCustomHeaders,
  readDeviceId,
  replaceUserAgentProduct,
  WOW_CUSTOM_HEADERS_ENV,
  WOW_PLATFORM,
} from './identity';
export type { HostIdentity, IdentityOptions } from './identity';

export {
  apiKeyEnvMissingMessage,
  credentialConflictMessage,
  declaredProviderCredential,
  reconcileProviderCredentialUpdate,
} from './provider-credential';
export type {
  DeclaredProviderCredential,
  ProviderCredentialReconciliation,
  ProviderCredentialUpdate,
  ProviderCredentialView,
} from './provider-credential';

export type { OAuthTokenTransactionOptions } from './oauth-token-transaction';
export { OAuthTokenTransaction } from './oauth-token-transaction';
