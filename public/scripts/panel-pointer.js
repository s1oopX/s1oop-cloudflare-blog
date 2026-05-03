let activePanel = null;
let panelPointerFrame = 0;
let panelPointerEvent = null;

document.addEventListener('pointerover', (event) => {
  const panel = event.target.closest?.('.ui-panel');
  if (panel) activePanel = panel;
});

document.addEventListener('pointerout', (event) => {
  if (!activePanel || activePanel.contains(event.relatedTarget)) return;
  activePanel = null;
});

document.addEventListener('pointermove', (event) => {
  if (!activePanel) return;
  panelPointerEvent = event;
  if (panelPointerFrame) return;

  panelPointerFrame = window.requestAnimationFrame(() => {
    panelPointerFrame = 0;
    const currentEvent = panelPointerEvent;
    const panel = activePanel;
    if (!panel || !currentEvent) return;

    const rect = panel.getBoundingClientRect();
    panel.style.setProperty('--pointer-x', `${currentEvent.clientX - rect.left}px`);
    panel.style.setProperty('--pointer-y', `${currentEvent.clientY - rect.top}px`);
  });
});
