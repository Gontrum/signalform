export type QueueError =
  | { readonly type: "LmsUnavailable"; readonly message: string }
  | { readonly type: "InvalidResponse"; readonly message: string }
  | { readonly type: "InvalidInput"; readonly message: string };
