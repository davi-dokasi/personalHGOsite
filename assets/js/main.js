(() => {
  'use strict';

  const doc = document.documentElement;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const COPY_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V6a3 3 0 0 1 3-3h7"/></svg>';

  // ---------- Tema claro/escuro ----------
  const currentTheme = () => doc.getAttribute('data-theme') || (darkQuery.matches ? 'dark' : 'light');
  const announceTheme = () => document.dispatchEvent(new CustomEvent('themechange', { detail: currentTheme() }));

  const themeBtn = $('[data-theme-toggle]');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* modo privado */ }
      announceTheme();
    });
  }
  darkQuery.addEventListener('change', () => {
    if (!doc.hasAttribute('data-theme')) announceTheme();
  });

  // ---------- Menu mobile ----------
  const nav = $('[data-nav]');
  const navBtn = $('[data-nav-toggle]');
  if (nav && navBtn) {
    const setOpen = (open) => {
      nav.classList.toggle('is-open', open);
      navBtn.setAttribute('aria-expanded', String(open));
    };
    navBtn.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
    nav.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { setOpen(false); navBtn.focus(); }
    });
    document.addEventListener('click', (e) => {
      if (nav.classList.contains('is-open') && !nav.contains(e.target) && !navBtn.contains(e.target)) setOpen(false);
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', (e) => { if (e.matches) setOpen(false); });
  }

  // ---------- Revelação ao rolar ----------
  const revealEls = $$('[data-reveal]');
  if (revealEls.length && 'IntersectionObserver' in window && !reduceMotion.matches) {
    // Pequeno atraso em cascata para irmãos (cards em grade, itens de lista)
    revealEls.forEach((el) => {
      const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.hasAttribute('data-reveal')) : [];
      const i = siblings.indexOf(el);
      if (i > 0) el.style.transitionDelay = `${Math.min(i, 5) * 70}ms`;
    });
    // O que já está na tela aparece sem piscar
    const vh = window.innerHeight;
    revealEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) el.classList.add('is-visible');
    });
    doc.classList.add('reveal-ready');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    revealEls.forEach((el) => { if (!el.classList.contains('is-visible')) io.observe(el); });
  }

  // ---------- Menu: destaca a seção visível ----------
  const spyLinks = $$('[data-spy]');
  if (spyLinks.length && 'IntersectionObserver' in window) {
    const targets = new Map();
    spyLinks.forEach((a) => {
      const section = document.getElementById(a.dataset.spy);
      if (section) targets.set(section, a);
    });
    const hero = $('.hero');
    if (hero) targets.set(hero, null);
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const active = targets.get(entry.target);
        spyLinks.forEach((l) => {
          const on = l === active;
          l.classList.toggle('is-active', on);
          if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    targets.forEach((_, section) => spy.observe(section));
  }

  // ---------- Copiar texto (e-mail) ----------
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  };

  $$('[data-copy]').forEach((btn) => {
    const label = $('[data-copy-label]', btn);
    const original = label ? label.textContent : '';
    let timer = 0;
    btn.addEventListener('click', async () => {
      if (!(await copy(btn.dataset.copy)) || !label) return;
      label.textContent = btn.dataset.copied || original;
      btn.classList.add('is-done');
      clearTimeout(timer);
      timer = setTimeout(() => { label.textContent = original; btn.classList.remove('is-done'); }, 2000);
    });
  });

  // ---------- Linha do tempo: detalhes ao passar o mouse ou focar ----------
  const timeline = $('[data-timeline]');
  if (timeline) {
    const out = $('[data-timeline-readout]', timeline);
    const bars = $$('.timeline__bar', timeline);
    const show = (bar) => {
      bars.forEach((b) => b.classList.toggle('is-active', b === bar));
      out.textContent = bar ? bar.dataset.detail : out.dataset.default;
      out.classList.toggle('is-active', Boolean(bar));
    };
    bars.forEach((bar) => {
      bar.addEventListener('mouseenter', () => show(bar));
      bar.addEventListener('focus', () => show(bar));
      bar.addEventListener('mouseleave', () => show(null));
      bar.addEventListener('blur', () => show(null));
    });
  }

  // ---------- Post: blocos de código com linguagem + copiar ----------
  const prose = $('.prose');
  if (prose) {
    const labels = { copy: prose.dataset.copyLabel || 'Copy', done: prose.dataset.copiedLabel || 'Copied' };
    $$('.highlight', prose).forEach((block) => {
      const code = $('code', block);
      if (!code) return;
      const tools = document.createElement('div');
      tools.className = 'code-tools';
      if (code.dataset.lang) {
        const lang = document.createElement('span');
        lang.className = 'code-tools__lang';
        lang.textContent = code.dataset.lang;
        tools.appendChild(lang);
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-tools__copy';
      btn.innerHTML = COPY_ICON;
      const text = document.createElement('span');
      text.textContent = labels.copy;
      btn.appendChild(text);
      btn.addEventListener('click', async () => {
        if (await copy(code.innerText.replace(/\n$/, ''))) {
          text.textContent = labels.done;
          setTimeout(() => { text.textContent = labels.copy; }, 1600);
        }
      });
      tools.appendChild(btn);
      block.appendChild(tools);
    });
  }

  // ---------- Post: sumário acompanha a leitura ----------
  const toc = $('[data-toc]');
  if (toc) {
    if (window.matchMedia('(max-width: 1099px)').matches) toc.open = false;
    const links = $$('a[href^="#"]', toc);
    const headings = new Map();
    links.forEach((a) => {
      const h = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (h) headings.set(h, a);
    });
    if ('IntersectionObserver' in window) {
      const tocSpy = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((l) => l.classList.remove('is-active'));
          const a = headings.get(entry.target);
          if (a) a.classList.add('is-active');
        });
      }, { rootMargin: '-15% 0px -75% 0px' });
      headings.forEach((_, h) => tocSpy.observe(h));
    }
  }

  // ---------- Rolagem: cabeçalho e barra de progresso ----------
  const header = $('[data-header]');
  const progress = $('[data-progress] span');
  const article = $('.post');
  const onScroll = () => {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    if (progress && article) {
      const r = article.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 1;
      progress.style.setProperty('--p', p.toFixed(4));
    }
  };
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { onScroll(); ticking = false; });
  }, { passive: true });
  onScroll();
})();
