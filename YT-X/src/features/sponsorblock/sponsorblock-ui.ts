import './sponsorblock-ui.css';
import sponsorBlockIcon from './sponsorblock-icon.png';
import { categoryInfo } from './categories';
import { SPONSOR_POPUP } from '../../config/ui-text';
import { formatTime } from '../../core/format';

// The quality toast finishes ~7s after playback starts (4s delay + 3s visible).
const AUTO_SHOW_DELAY_MS = 8000;
const AUTO_HIDE_MS = 8000;

/** The slice of a SponsorBlock segment the popup lists. */
interface PopupSegment {
  category: string;
  segment: readonly [number, number];
}

type Timer = ReturnType<typeof setTimeout>;

const categoryNames: Readonly<Record<string, string | undefined>> =
  SPONSOR_POPUP.categories;

class SponsorBlockUI {
  popup: HTMLDivElement | null = null;
  hasSegments = false;
  showTimer: Timer | null = null;
  hideTimer: Timer | null = null;
  hasShownOnce = false;
  suppressed = false;

  getSegmentColor(category: string): string {
    return categoryInfo(category)?.color || '#717171';
  }

  getCategoryName(category: string): string {
    return (
      categoryNames[category] ||
      category.charAt(0).toUpperCase() + category.slice(1)
    );
  }

  createPopup(): HTMLDivElement {
    if (this.popup) return this.popup;

    const popup = document.createElement('div');
    popup.className = 'sb-segments-popup';
    popup.setAttribute('tabindex', '-1');
    popup.setAttribute('role', 'region');
    popup.setAttribute('aria-labelledby', 'sb-popup-title');
    // Interacting with the popup keeps it up; leaving restarts a full hide timer.
    popup.addEventListener('focusin', () => this.pauseHide());
    popup.addEventListener('mouseenter', () => this.pauseHide());
    popup.addEventListener('focusout', () => this.resumeHide());
    popup.addEventListener('mouseleave', () => this.resumeHide());

    const header = document.createElement('div');
    header.className = 'sb-popup-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'sb-header-title-row';

    const icon = document.createElement('img');
    icon.className = 'sb-header-icon';
    icon.src = sponsorBlockIcon;
    // The adjacent title already names it.
    icon.alt = '';

    const titleText = document.createElement('span');
    titleText.className = 'sb-header-text';
    titleText.id = 'sb-popup-title';
    titleText.textContent = SPONSOR_POPUP.title;

    titleRow.appendChild(icon);
    titleRow.appendChild(titleText);

    const subtitle = document.createElement('div');
    subtitle.className = 'sb-header-subtitle';
    subtitle.textContent = SPONSOR_POPUP.subtitle;

    header.appendChild(titleRow);
    header.appendChild(subtitle);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sb-popup-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', SPONSOR_POPUP.dismissLabel);
    close.addEventListener('click', () => this.dismiss());

    // Visually hidden live region: announces the count once, not every row.
    const status = document.createElement('p');
    status.className = 'sb-popup-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    const listContainer = document.createElement('div');
    listContainer.className = 'sb-list-container';
    listContainer.setAttribute('role', 'list');

    popup.appendChild(close);
    popup.appendChild(status);
    popup.appendChild(header);
    popup.appendChild(listContainer);
    document.body.appendChild(popup);
    this.popup = popup;

    return popup;
  }

  updateSegments(segments: readonly PopupSegment[]): void {
    const popup = this.createPopup();
    const container = popup.querySelector('.sb-list-container');
    if (!container) return;
    container.textContent = '';
    const status = popup.querySelector('.sb-popup-status');
    if (status) {
      status.textContent =
        segments.length > 0 ? SPONSOR_POPUP.segmentsFound(segments.length) : '';
    }

    this.hasSegments = segments.length > 0;
    if (!this.hasSegments) {
      this.clearTimers();
      this.hasShownOnce = false;
      popup.classList.remove('visible');
      return;
    }

    const sortedSegments = [...segments].sort(
      (a, b) => a.segment[0] - b.segment[0]
    );

    sortedSegments.forEach((segment) => {
      const row = document.createElement('div');
      row.className = 'sb-segment-row';
      row.setAttribute('tabindex', '-1');
      row.setAttribute('role', 'listitem');

      const color = this.getSegmentColor(segment.category);
      const startTime = formatTime(segment.segment[0]);
      const endTime = formatTime(segment.segment[1]);
      const categoryName = this.getCategoryName(segment.category);

      let timeLabel: string;
      if (segment.category === 'poi_highlight' || segment.category === 'poi') {
        timeLabel = startTime;
      } else {
        timeLabel = `${startTime} to ${endTime}`;
      }

      const leftRow = document.createElement('div');
      leftRow.className = 'sb-row-left';

      const dot = document.createElement('div');
      dot.className = 'sb-segment-dot';
      dot.style.backgroundColor = color;

      const categorySpan = document.createElement('span');
      categorySpan.className = 'sb-segment-category';
      categorySpan.textContent = categoryName;

      leftRow.appendChild(dot);
      leftRow.appendChild(categorySpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = 'sb-segment-time';
      timeSpan.textContent = timeLabel;

      row.appendChild(leftRow);
      row.appendChild(timeSpan);

      container.appendChild(row);
    });
  }

  private armHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.popup?.classList.remove('visible');
    }, AUTO_HIDE_MS);
  }

  /** Focus or hover: the popup stays until the user leaves it. */
  pauseHide(): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  resumeHide(): void {
    if (this.popup?.classList.contains('visible')) this.armHide();
  }

  dismiss(): void {
    this.clearTimers();
    this.popup?.classList.remove('visible');
  }

  clearTimers(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.showTimer = null;
    this.hideTimer = null;
  }

  // Shows the popup once per video, AUTO_SHOW_DELAY_MS after playback starts.
  scheduleAutoShow(): void {
    if (
      this.suppressed ||
      this.showTimer ||
      this.hasShownOnce ||
      !this.hasSegments
    ) {
      return;
    }

    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.suppressed || this.hasShownOnce || !this.hasSegments) return;

      this.hasShownOnce = true;
      this.popup?.classList.add('visible');
      this.armHide();
    }, AUTO_SHOW_DELAY_MS);
  }

  // Called with the settings-panel state: the popup never shows while it is open.
  setSuppressed(suppressed: boolean): void {
    this.suppressed = suppressed;
    if (suppressed) {
      this.clearTimers();
      if (this.popup) this.popup.classList.remove('visible');
    } else {
      this.scheduleAutoShow();
    }
  }
}

export default new SponsorBlockUI();
