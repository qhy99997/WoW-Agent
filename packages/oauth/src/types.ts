/** Device identification for `X-Msh-*` headers. */
export type DeviceHeaders = {
  readonly 'X-Msh-Platform': string;
  readonly 'X-Msh-Version': string;
  readonly 'X-Msh-Device-Name': string;
  readonly 'X-Msh-Device-Model': string;
  readonly 'X-Msh-Os-Version': string;
  readonly 'X-Msh-Device-Id': string;
};
