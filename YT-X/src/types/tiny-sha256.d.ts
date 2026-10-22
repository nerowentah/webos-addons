declare module 'tiny-sha256' {
  /** Hex SHA-256 of `message`; `undefined` when it cannot be hashed. */
  export default function sha256(message: string): string | undefined;
}
