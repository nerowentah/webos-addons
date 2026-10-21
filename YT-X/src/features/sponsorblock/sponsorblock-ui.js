import './sponsorblock-ui.css';
import sponsorBlockIcon from './sponsorblock-icon.png';
import { segmentColors } from '../../config/config.js';
import { SPONSOR_POPUP } from '../../config/ui-text.js';
import { formatTime } from '../../core/format.js';

// The quality toast finishes ~7s after playback starts (4s delay + 3s visible).
const AUTO_SHOW_DELAY_MS = 8000;
const AUTO_HIDE_MS = 8000;

class SponsorBlockUI {
  constructor() {
    this.popup = null;
    this.hasSegments = false;
    this.showTimer = null;
    this.hideTimer = null;
    this.hasShownOnce = false;
    this.suppressed = false;
  }

  getSegmentColor(category) {
    return segmentColors[category] || '#777';
  }

  getCategoryName(category) {
    return (
      SPONSOR_POPUP.categories[category] ||
      category.charAt(0).toUpperCase() + category.slice(1)
    );
  }

  createPopup() {
    if (this.popup) return this.popup;

    const popup = document.createElement('div');
    popup.className = 'sb-segments-popup';
    popup.setAttribute('tabindex', '-1');

    const header = document.createElement('div');
    header.className = 'sb-popup-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'sb-header-title-row';

    const icon = document.createElement('img');
    icon.className = 'sb-header-icon';
    icon.src = sponsorBlockIcon;
    icon.alt = 'SponsorBlock';

    const titleText = document.createElement('span');
    titleText.className = 'sb-header-text';
    titleText.textContent = SPONSOR_POPUP.title;

    titleRow.appendChild(icon);
    titleRow.appendChild(titleText);

    const subtitle = document.createElement('div');
    subtitle.className = 'sb-header-subtitle';
    subtitle.textContent = SPONSOR_POPUP.subtitle;

    header.appendChild(titleRow);
    header.appendChild(subtitle);

    const listContainer = document.createElement('div');
    listContainer.className = 'sb-list-container';

    popup.appendChild(header);
    popup.appendChild(listContainer);
    document.body.appendChild(popup);
    this.popup = popup;

    return popup;
  }

  updateSegments(segments) {
    if (!this.popup) this.createPopup();
    const container = this.popup.querySelector('.sb-list-container');
    container.textContent = '';

    this.hasSegments = segments && segments.length > 0;
    if (!this.hasSegments) {
      this.clearTimers();
      this.hasShownOnce = false;
      this.popup.classList.remove('visible');
      return;
    }

    const sortedSegments = [...segments].sort(
      (a, b) => a.segment[0] - b.segment[0]
    );

    sortedSegments.forEach((segment) => {
      const row = document.createElement('div');
      row.className = 'sb-segment-row';
      row.setAttribute('tabindex', '-1');

      const color = this.getSegmentColor(segment.category);
      const startTime = formatTime(segment.segment[0]);
      const endTime = formatTime(segment.segment[1]);
      const categoryName = this.getCategoryName(segment.category);

      let timeLabel;
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

  clearTimers() {
    clearTimeout(this.showTimer);
    clearTimeout(this.hideTimer);
    this.showTimer = null;
    this.hideTimer = null;
  }

  // Shows the popup once per video, AUTO_SHOW_DELAY_MS after playback starts.
  scheduleAutoShow() {
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
      this.popup.classList.add('visible');
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        this.popup.classList.remove('visible');
      }, AUTO_HIDE_MS);
    }, AUTO_SHOW_DELAY_MS);
  }

  // Called with the settings-panel state: the popup never shows while it is open.
  setSuppressed(suppressed) {
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
