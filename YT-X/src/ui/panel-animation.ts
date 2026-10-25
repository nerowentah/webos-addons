// Open/close transition for the options panel.

let panelExitTimer: ReturnType<typeof setTimeout> | null = null;
let panelEntranceRaf: number | null = null;

function cancelPanelAnimation(): void {
  if (panelExitTimer) {
    clearTimeout(panelExitTimer);
    panelExitTimer = null;
  }
  if (panelEntranceRaf) {
    cancelAnimationFrame(panelEntranceRaf);
    panelEntranceRaf = null;
  }
}

// Pose hidden, force a reflow, then flip on the next frame; without the
// intermediate commit the transition has no "from" value and pops in.
export function animatePanelIn(panel: HTMLElement): void {
  cancelPanelAnimation();
  panel.classList.remove('collapse-start', 'collapse-end');
  panel.classList.add('collapse-start');
  // Forced reflow; `void` marks the read as intentional.
  // eslint-disable-next-line @typescript-eslint/no-meaningless-void-operator
  void panel.offsetWidth;
  panelEntranceRaf = requestAnimationFrame(() => {
    panelEntranceRaf = null;
    panel.classList.remove('collapse-start');
    panel.classList.add('collapse-end');
  });
}

// Fixed timer, not transitionend (unreliable when backgrounded); the
// display:none that follows stops the hidden panel trapping focus/clicks.
export function animatePanelOut(panel: HTMLElement): void {
  if (panelEntranceRaf) {
    cancelAnimationFrame(panelEntranceRaf);
    panelEntranceRaf = null;
  }
  panel.classList.remove('collapse-end');
  panel.classList.add('collapse-start');
  panelExitTimer = setTimeout(() => {
    panelExitTimer = null;
    panel.style.display = 'none';
    panel.classList.remove('collapse-start');
  }, 300);
}
