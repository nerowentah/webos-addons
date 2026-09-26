const webpTestImgs = {
  lossy: 'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  lossless: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
  alpha:
    'UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==',
  animation:
    'UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA'
} as const;

function checkWebpFeature(
  feature: keyof typeof webpTestImgs,
  callback: (
    featureName: keyof typeof webpTestImgs,
    isSupported: boolean
  ) => void
) {
  const img = new Image();
  img.onload = function () {
    const result = img.width > 0 && img.height > 0;
    callback(feature, result);
  };

  img.onerror = function () {
    callback(feature, false);
  };

  img.src = 'data:image/webp;base64,' + webpTestImgs[feature];
}

let webpSupported = false;
checkWebpFeature('lossy', (_, support) => {
  webpSupported = support;
});

const YT_THUMBNAIL_PATHNAME_REGEX =
  /vi(?:_webp)?(\/.*?\/)([a-z0-9]+)(_\w*)?\.[a-z]+$/;

const YT_THUMBNAIL_NAMES = ['sddefault', 'hqdefault', 'mqdefault', 'default'];

const YT_UPGRADE_NAMES = ['maxresdefault', 'sddefault'] as const;

function isABTest(url: URL) {
  return url.hostname.match(/^i\d/) !== null;
}

/**
 * Compute the list of higher-resolution replacement URLs for a thumbnail.
 * Returns null when the URL is not a regular, upgradable thumbnail.
 */
function thumbnailCandidates(url: URL): URL[] | null {
  // Don't know how to handle A/B test thumbnails so we don't upgrade them.
  if (isABTest(url)) return null;

  const match = url.pathname.match(YT_THUMBNAIL_PATHNAME_REGEX);
  if (match === null) return null;

  const [, p1, p2, p3] = match;
  if (p2 === undefined) return null;
  if (!YT_THUMBNAIL_NAMES.includes(p2)) return null; // Only regular thumbnails. Not shorts, etc.

  const ext = webpSupported ? 'webp' : 'jpg';
  const dir = webpSupported ? 'vi_webp' : 'vi';

  const candidates = YT_UPGRADE_NAMES.map((name) => {
    const target = new URL(url);
    target.pathname = `${dir}${p1}${name}${p3 ?? ''}.${ext}`;
    target.search = '';
    return target;
  }).filter((target) => target.href !== url.href); // Drop the URL if it's already upgraded.

  return candidates.length > 0 ? candidates : null;
}

function parseCSSUrl(value: string): URL | undefined {
  try {
    return new URL(value.slice(4, -1).replace(/["']/g, ''));
  } catch {
    return undefined; // Not a valid URL
  }
}

function parseImgUrl(img: HTMLImageElement): URL | undefined {
  try {
    return new URL(
      img.currentSrc || img.getAttribute('src') || '',
      document.baseURI
    );
  } catch {
    return undefined; // Not a valid URL
  }
}

function loadSizeSatisfied(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const loader = new Image();

    loader.onload = () => {
      // Don't use placeholder thumbnails: they are the same size as the "default" size.
      resolve(loader.naturalHeight !== 90);
    };

    loader.onerror = () => resolve(false);

    loader.src = src;
  });
}

async function upgradeImage(
  current: URL,
  candidates: URL[],
  apply: (target: URL) => void,
  isCurrent: () => URL | null | undefined
) {
  async function tryNext(index: number) {
    const target = candidates[index];
    if (target === undefined) return;

    if (!(await loadSizeSatisfied(target.href))) {
      await tryNext(index + 1);
      return;
    }

    // Don't swap out the image if it has been changed while the target image was loading.
    const now = isCurrent();
    if (!now || now.href !== current.href) return;

    apply(target);
  }

  await tryNext(0);
}

function upgradeBgImg(element: HTMLElement) {
  const style = element.style;
  const current = parseCSSUrl(style.backgroundImage);
  if (!current) return;

  const candidates = thumbnailCandidates(current);
  if (!candidates) return;

  upgradeImage(
    current,
    candidates,
    (target) => {
      style.backgroundImage = `url(${target.href})`;
    },
    () => parseCSSUrl(style.backgroundImage)
  );
}

function upgradeImgElement(img: HTMLImageElement) {
  const current = parseImgUrl(img);
  if (!current) return;

  const candidates = thumbnailCandidates(current);
  if (!candidates) return;

  upgradeImage(
    current,
    candidates,
    (target) => {
      img.src = target.href;
    },
    () => parseImgUrl(img)
  );
}

const obs = new MutationObserver((mutations) => {
  const dummy = document.createElement('div');

  // handle backgroundImage change
  // YT re-uses thumbnail elements in its virtual list implementation.
  mutations
    .filter((mut) => mut.type === 'attributes')
    .map((mut) => [mut.target, mut] as const)
    .filter((value): value is [HTMLElement, MutationRecord] => {
      const [node, { oldValue }] = value;
      dummy.style.cssText = oldValue ?? '';

      return (
        node instanceof HTMLElement &&
        node.style.backgroundImage.includes('ytimg') &&
        node.style.backgroundImage !== dummy.style.backgroundImage
      );
    })
    .forEach(([elem]) => {
      upgradeBgImg(elem);
    });

  // handle element add
  mutations
    .filter((mut) => mut.type === 'childList')
    .flatMap((mut) => Array.from(mut.addedNodes))
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .forEach((elem) => {
      if (elem.style.backgroundImage !== '') upgradeBgImg(elem);

      if (elem instanceof HTMLImageElement && elem.getAttribute('src')) {
        upgradeImgElement(elem);
      }

      for (const el of elem.querySelectorAll<HTMLElement>('[style*="ytimg"]')) {
        upgradeBgImg(el);
      }

      for (const img of elem.querySelectorAll<HTMLImageElement>(
        'img[src*="ytimg"]'
      )) {
        upgradeImgElement(img);
      }
    });
});

function enableObserver() {
  obs.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
    attributeOldValue: true
  });
}

import { configRead, configAddChangeListener } from './config';

if (configRead('upgradeThumbnails')) enableObserver();

configAddChangeListener('upgradeThumbnails', (value) =>
  value ? enableObserver() : obs.disconnect()
);
