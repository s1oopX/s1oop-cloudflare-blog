const landing = document.querySelector('.landing-scroll');
const stages = [...document.querySelectorAll('.landing-stage')];
const dots = [...document.querySelectorAll('[data-panel-target]')];
const cue = document.querySelector('.landing-scroll-cue');
const portrait = document.querySelector('.landing-portrait');
const latestLink = document.querySelector('[data-landing-latest]');
const latestDate = document.querySelector('[data-landing-latest-date]');
const latestTitle = document.querySelector('[data-landing-latest-title]');
const latestExcerpt = document.querySelector('[data-landing-latest-excerpt]');
const panelCount = stages.length;
let activeIndex = location.hash === '#enter-blog' ? 1 : 0;
let isAnimating = false;
let wheelDelta = 0;
let wheelResetTimer = 0;
let touchStartY = 0;
let touchDeltaY = 0;

const clampPanel = (index) => Math.max(0, Math.min(panelCount - 1, index));

const setDrag = (value) => {
  landing?.style.setProperty('--landing-drag', `${value}px`);
};

const activatePanel = (index, options = {}) => {
  const nextIndex = clampPanel(index);
  activeIndex = nextIndex;
  setDrag(0);
  landing?.classList.remove('is-dragging');
  landing?.style.setProperty('--landing-index', String(activeIndex));
  landing?.style.setProperty('--landing-offset', `${activeIndex * -100}dvh`);
  landing?.setAttribute('data-panel', String(activeIndex));

  stages.forEach((stage, stageIndex) => {
    stage.classList.toggle('is-active', stageIndex === activeIndex);
  });

  dots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === activeIndex;
    dot.classList.toggle('is-active', isActive);
    if (isActive) {
      dot.setAttribute('aria-current', 'true');
    } else {
      dot.removeAttribute('aria-current');
    }
  });

  if (!options.instant) {
    isAnimating = true;
    window.setTimeout(() => {
      isAnimating = false;
    }, 720);
  }
};

const nudgeBoundary = (direction) => {
  if (!landing || isAnimating) return;
  isAnimating = true;
  landing.classList.add('is-nudging');
  setDrag(direction > 0 ? -30 : 30);

  window.setTimeout(() => setDrag(0), 90);
  window.setTimeout(() => {
    landing.classList.remove('is-nudging');
    isAnimating = false;
  }, 360);
};

const requestPanel = (direction) => {
  const nextIndex = clampPanel(activeIndex + direction);
  if (nextIndex === activeIndex) {
    nudgeBoundary(direction);
    return;
  }

  activatePanel(nextIndex);
};

landing?.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (isAnimating) return;

  const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
  wheelDelta += delta;
  window.clearTimeout(wheelResetTimer);
  wheelResetTimer = window.setTimeout(() => {
    wheelDelta = 0;
  }, 150);

  if (Math.abs(wheelDelta) >= 90) {
    requestPanel(wheelDelta > 0 ? 1 : -1);
    wheelDelta = 0;
  }
}, { passive: false });

landing?.addEventListener('touchstart', (event) => {
  if (isAnimating) return;
  touchStartY = event.touches[0]?.clientY ?? 0;
  touchDeltaY = 0;
  landing.classList.add('is-dragging');
}, { passive: true });

landing?.addEventListener('touchmove', (event) => {
  if (isAnimating || !touchStartY) return;
  event.preventDefault();
  const touchY = event.touches[0]?.clientY ?? touchStartY;
  touchDeltaY = touchY - touchStartY;
  const atStart = activeIndex === 0 && touchDeltaY > 0;
  const atEnd = activeIndex === panelCount - 1 && touchDeltaY < 0;
  const dampedDelta = atStart || atEnd ? touchDeltaY * 0.28 : touchDeltaY;
  setDrag(Math.max(-110, Math.min(110, dampedDelta)));
}, { passive: false });

landing?.addEventListener('touchend', () => {
  landing?.classList.remove('is-dragging');
  if (isAnimating) return;

  if (Math.abs(touchDeltaY) >= 62) {
    requestPanel(touchDeltaY < 0 ? 1 : -1);
  } else {
    activatePanel(activeIndex);
  }

  touchStartY = 0;
  touchDeltaY = 0;
});

cue?.addEventListener('click', (event) => {
  event.preventDefault();
  activatePanel(1);
});

portrait?.addEventListener('click', () => {
  activatePanel(1);
});

portrait?.addEventListener('pointerenter', () => {
  portrait.classList.add('is-running');
});

portrait?.addEventListener('pointerleave', () => {
  portrait.classList.remove('is-running');
});

portrait?.addEventListener('focus', () => {
  portrait.classList.add('is-running');
});

portrait?.addEventListener('blur', () => {
  portrait.classList.remove('is-running');
});

let portraitPointerFrame = 0;
let portraitPointerEvent = null;

document.addEventListener('pointermove', (event) => {
  portraitPointerEvent = event;
  if (portraitPointerFrame) return;

  portraitPointerFrame = window.requestAnimationFrame(() => {
    portraitPointerFrame = 0;
    if (!portrait || !portraitPointerEvent) return;
    const rect = portrait.getBoundingClientRect();
    const isInside =
      portraitPointerEvent.clientX >= rect.left &&
      portraitPointerEvent.clientX <= rect.right &&
      portraitPointerEvent.clientY >= rect.top &&
      portraitPointerEvent.clientY <= rect.bottom;
    portrait.classList.toggle('is-running', isInside);
  });
});

dots.forEach((dot) => {
  dot.addEventListener('click', () => {
    activatePanel(Number(dot.getAttribute('data-panel-target') ?? 0));
  });
});

window.addEventListener('keydown', (event) => {
  if (['ArrowDown', 'PageDown', ' '].includes(event.key)) {
    event.preventDefault();
    requestPanel(1);
  }

  if (['ArrowUp', 'PageUp'].includes(event.key)) {
    event.preventDefault();
    requestPanel(-1);
  }
});

activatePanel(activeIndex, { instant: true });

fetch('/api/posts?limit=1')
  .then((response) => response.ok ? response.json() : null)
  .then((data) => {
    const post = Array.isArray(data?.posts) ? data.posts[0] : null;
    if (!post || !latestLink) return;

    const date = new Date(post.date);
    latestLink.href = post.href || '/blog';
    if (latestDate) {
      latestDate.textContent = Number.isNaN(date.getTime())
        ? '最近'
        : `最近 / ${date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}`;
    }
    if (latestTitle) latestTitle.textContent = post.title || '';
    if (latestExcerpt) latestExcerpt.textContent = post.excerpt || '';
    latestLink.hidden = false;
  })
  .catch(() => {});
