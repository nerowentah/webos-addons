type webOSLaunchParams = Record<string, unknown>;

/**
 * The webOS API the platform injects into the webview.
 *
 * Only the members this app reads are declared. The reference documents
 * `deviceInfo` as a *callback* method ("The function to call once the
 * information is collected", "Call returns: Returns undefined"), but some
 * community typings describe it as a plain object instead. webos-device.ts
 * probes for both shapes at runtime rather than trusting either, so the type
 * here is the union of the two.
 *
 * @see https://webostv.developer.lge.com/develop/references/webostvjs-webos
 */
export interface WebOSDeviceInfo {
  /** Model name in UTF-8, e.g. "OLED55C14PUA". */
  modelName?: string;
  /** Full TV software version, as shown in the TV's settings. */
  version?: string;
  versionMajor?: number;
  versionMinor?: number;
  versionDot?: number;
  /** webOS TV version in X.X.X format. */
  sdkVersion?: string;

  /**
   * Screen width in pixels **for video playback**.
   *
   * The same reference is explicit that this is not the graphics canvas: "For
   * the app resolution (width) for graphics display, use `window.innerWidth`."
   * The two are separate hardware planes.
   */
  screenWidth?: number;
  /** Screen height in pixels for video playback. See `screenWidth`. */
  screenHeight?: number;

  /** Whether the device supports Ultra HD resolution. */
  uhd?: boolean;
  /** Whether the device supports 8K UHD resolution. */
  uhd8K?: boolean;

  /**
   * Whether the panel is OLED.
   *
   * Marked `Optional*` upstream: "On the previous version of webOS TV that does
   * not support this property, return undefined." Callers must handle undefined
   * rather than treating it as false.
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
   * The Luna IPC bridge, present when webOSTV.js is loaded.
   *
   * Not used for detection. Luna can describe the board and which pipelines the
   * SoC has, but it does not expose the panel's output resolution, so it cannot
   * substitute for deviceInfo on the video plane. Kept for the debug matrix.
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
