// Page fixes that are not part of the options panel.

export function applyUIFixes(): void {
  try {
    const bodyClasses = document.body.classList;

    // Strip eagerly: the observer below only reacts to later changes.
    bodyClasses.remove('app-quality-root');

    const observer = new MutationObserver(function bodyClassCallback() {
      try {
        if (bodyClasses.contains('app-quality-root')) {
          bodyClasses.remove('app-quality-root');
        }
      } catch {
        // A throwing observer callback must not break the mutation loop.
      }
    });

    observer.observe(document.body, {
      subtree: false,
      childList: false,
      attributes: true,
      attributeFilter: ['class'],
      characterData: false
    });
  } catch {
    // Observer setup is best-effort.
  }
}
