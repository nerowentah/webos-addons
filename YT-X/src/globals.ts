type webOSLaunchParams = Record<string, unknown>;

/**
 * Device info from the platform-injected `webOS` API; only the members this app reads are declared, and webos-device.ts probes both the documented callback shape and the community object shape at runtime.
 * @see https://webostv.developer.lge.com/develop/references/webostvjs-webos
 */
export interface WebOSDeviceInfo {
  modelName?: string;
  version?: string;
  versionMajor?: number;
  versionMinor?: number;
  versionDot?: number;
  /** webOS TV version in X.X.X format. */
  sdkVersion?: string;

  /**
   * Screen width in pixels for video playback, not the graphics canvas - the reference is explicit that `window.innerWidth` answers that; they are separate hardware planes.
   */
  screenWidth?: number;
  /** Screen height in pixels for video playback. See `screenWidth`. */
  screenHeight?: number;

  uhd?: boolean;
  uhd8K?: boolean;

  /**
   * Whether the panel is OLED; marked `Optional*` upstream ("On the previous version of webOS TV that does not support this property, return undefined"), so callers must handle undefined rather than treating it as false.
   */
  oled?: boolean;

  hdr10?: boolean;
  dolbyVision?: boolean;
  dolbyAtmos?: boolean;
  ddrSize?: string;
  brandName?: string;
  manufacturer?: string;
  mainboardMaker?: string;
  platformBizType?: string;
  /** Added for webOS TV 26 and above (webOSTV.js v1.2.13). */
  tuner?: boolean;
}

export type WebOSDeviceInfoCallback = (info: WebOSDeviceInfo) => void;

export type WebOSDeviceInfoFn = (callback: WebOSDeviceInfoCallback) => void;

export type WebOSAppInfo = { resolution?: string; [key: string]: unknown };

export type WebOSAppInfoCallback = (info?: WebOSAppInfo) => void;

export interface WebOSApi {
  libVersion?: string;
  platform?: { tv?: boolean; chrome?: number };
  /** Documented as a callback method; also probed as a plain object. */
  deviceInfo?: WebOSDeviceInfoFn | WebOSDeviceInfo;
  /**
   * The Luna IPC bridge, present when webOSTV.js is loaded; kept for the debug matrix only - it cannot expose the panel's video-plane resolution, so it cannot substitute for deviceInfo.
   */
  service?: {
    request?: (params: Record<string, unknown>) => Promise<unknown>;
  };
  systemInfo?: {
    country?: string;
    smartServiceCountry?: string;
    timezone?: string;
  };
  fetchAppId?: () => string;
  fetchAppRootPath?: () => string;
  fetchAppInfo?: (callback: WebOSAppInfoCallback, path?: string) => void;
}

declare global {
  interface Window {
    launchParams?: webOSLaunchParams;
    webOS?: WebOSApi;
    __ytx_debug__?: boolean;
  }

  interface Document {
    addEventListener(
      eventName: 'webOSRelaunch',
      listener: (evt: CustomEvent<webOSLaunchParams>) => void,
      useCapture?: boolean
    ): void;
  }
}
