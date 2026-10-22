import type { LaunchParams } from './launch-url';

/** Detail of the `ytx-page-update` window event (core/utils.ts). */
export interface PageUpdateDetail {
  isWatch: boolean;
  isShorts: boolean;
  isAccountSelector: boolean;
  isSearch: boolean;
}

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

type WebOSDeviceInfoCallback = (info: WebOSDeviceInfo) => void;

type WebOSDeviceInfoFn = (callback: WebOSDeviceInfoCallback) => void;

type WebOSAppInfo = { resolution?: string; [key: string]: unknown };

type WebOSAppInfoCallback = (info?: WebOSAppInfo) => void;

interface WebOSApi {
  libVersion?: string;
  platform?: { tv?: boolean; chrome?: number };
  /** Documented as a callback method; also probed as a plain object. */
  deviceInfo?: WebOSDeviceInfoFn | WebOSDeviceInfo;
  /**
   * The Luna IPC bridge, present when webOSTV.js is loaded; it cannot expose the panel's video-plane resolution, so it cannot substitute for deviceInfo.
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
    /** JSON string injected by the platform at launch; may be absent or malformed. */
    launchParams?: string;
    webOS?: WebOSApi;
  }

  interface WindowEventMap {
    'ytx-page-update': CustomEvent<PageUpdateDetail>;
  }

  interface Document {
    addEventListener(
      eventName: 'webOSRelaunch',
      listener: (evt: CustomEvent<LaunchParams>) => void,
      options?: boolean | AddEventListenerOptions
    ): void;
    removeEventListener(
      eventName: 'webOSRelaunch',
      listener: (evt: CustomEvent<LaunchParams>) => void,
      options?: boolean | EventListenerOptions
    ): void;
  }
}
