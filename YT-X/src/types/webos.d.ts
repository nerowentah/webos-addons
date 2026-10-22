// Platform-injected globals: the webOS JS API, the Luna bridge, and YouTube's `_yttv` internals.

/** The Luna IPC bridge the platform injects into every page. */
interface PalmServiceBridge {
  onservicecallback: ((message: string) => void) | null;
  call(uri: string, payload: string): void;
  cancel?(): void;
}

interface PalmServiceBridgeConstructor {
  new (): PalmServiceBridge;
}

interface Window {
  /** JSON string injected by the platform at launch; may be absent or malformed. */
  launchParams?: string;
  webOS?: import('../core/globals').WebOSApi;
  PalmServiceBridge?: PalmServiceBridgeConstructor;
  _yttv?: Record<string, unknown>;
}

interface WindowEventMap {
  'ytx-page-update': CustomEvent<import('../core/globals').PageUpdateDetail>;
}

interface Document {
  addEventListener(
    eventName: 'webOSRelaunch',
    listener: (
      evt: CustomEvent<import('../core/launch-url').LaunchParams>
    ) => void,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener(
    eventName: 'webOSRelaunch',
    listener: (
      evt: CustomEvent<import('../core/launch-url').LaunchParams>
    ) => void,
    options?: boolean | EventListenerOptions
  ): void;
}

interface DocumentEventMap {
  /** webOS reports the Magic Remote pointer appearing or hiding (it hides on D-pad presses). */
  cursorStateChange: CustomEvent<{ visibility?: boolean }>;
}
