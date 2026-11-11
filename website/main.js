// Sample quiz card
(() => {
  const opts = [...document.querySelectorAll('.opt')];
  const why = document.getElementById('why');
  const streak = document.getElementById('streak');
  const streakN = document.getElementById('streak-n');
  const progress = document.getElementById('progress');
  const confetti = document.getElementById('confetti');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  opts.forEach((btn) => btn.addEventListener('click', () => {
    const right = btn.hasAttribute('data-right');
    opts.forEach((o) => {
      o.disabled = true;
      if (o.hasAttribute('data-right')) o.classList.add('right');
      else if (o !== btn) o.classList.add('dim');
    });
    if (!right) btn.classList.add('wrong');
    why.textContent = (right ? 'Right. ' : 'Not quite. ') +
      'Opinions, events and other people are outside our control. Our judgments and actions are ours.';
    why.hidden = false;
    progress.style.width = '100%';
    setTimeout(() => {
      streak.classList.add('on', 'jump');
      streakN.textContent = '7';
      streak.setAttribute('aria-label', 'Streak 7 days');
      burst();
    }, 450);
  }));

  function burst() {
    if (still) return;
    const colors = ['--c1', '--c2', '--c3', '--c4', '--c5'];
    for (let i = 0; i < 36; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = `var(${colors[i % colors.length]})`;
      p.style.setProperty('--dx', (Math.random() - 0.5) * 120 + 'px');
      p.style.setProperty('--r', Math.random() * 720 - 360 + 'deg');
      p.style.animationDelay = Math.random() * 0.25 + 's';
      confetti.appendChild(p);
    }
    setTimeout(() => confetti.replaceChildren(), 2000);
  }
})();

// Provider tabs
(() => {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const next = tabs[(i + d + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  });
})();
