export type DiscoveredServer = {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly version: string;
};

export type DiscoveryError =
  | { readonly type: "UDP_ERROR"; readonly message: string }
  | { readonly type: "NETWORK_ERROR"; readonly message: string };

export type LmsPlayer = {
  readonly id: string;
  readonly name: string;
  readonly model: string;
  readonly connected: boolean;
};
