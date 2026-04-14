(() => {
  const CART_DEBUG_FLAG = 'cart_debug';
  const isCartDebugEnabled = () => {
    try {
      return new URL(window.location.href).searchParams.has(CART_DEBUG_FLAG) || window.localStorage?.getItem(CART_DEBUG_FLAG) === '1';
    } catch {
      return false;
    }
  };
  const debug = (...args) => {
    if (!isCartDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log('[flow_engine]', ...args);
  };

  const resolveItem = (target) => {
    if (!target || !target.closest) return null;
    let item = target.closest('[data-addon-variant-id]');
    if (!item) item = target.closest('.flow-addon__item');
    if (item && !item.hasAttribute('data-addon-variant-id')) {
      const owned = item.querySelector('[data-addon-variant-id]');
      if (owned instanceof HTMLElement) item = owned;
    }
    return item && item.hasAttribute('data-addon-variant-id') ? item : null;
  };

  const setSelected = (item, selected) => {
    item.dataset.addonSelected = String(Boolean(selected));
    const cb = item.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
    if (cb instanceof HTMLInputElement) cb.checked = Boolean(selected);
    const btn = item.querySelector('button.flow-addon__toggle-btn[data-flow-addon-toggle]');
    if (btn instanceof HTMLElement) btn.setAttribute('aria-pressed', String(Boolean(selected)));
  };

  const getAddonConfig = (addonRoot) => {
    const selectionMode = addonRoot?.dataset?.selectionMode || 'multiple';
    const enforceSingle = selectionMode === 'single';
    const preselectMode = addonRoot?.dataset?.preselectMode || 'none';
    const mustHaveOneSelected = enforceSingle && preselectMode !== 'none';
    return { enforceSingle, mustHaveOneSelected };
  };

  const deselectSiblings = (addonRoot, keepItem) => {
    if (!addonRoot) return;
    addonRoot.querySelectorAll('[data-addon-variant-id]').forEach((el) => {
      if (el !== keepItem && el instanceof HTMLElement) setSelected(el, false);
    });
  };

  const handleAddonToggleChange = (target) => {
    const cb = target;
    if (!(cb instanceof HTMLInputElement)) return false;
    if (cb.type !== 'checkbox') return false;
    if (!cb.closest?.('[data-flow-addon]')) return false;

    const addonRoot = cb.closest('[data-flow-addon]');
    const item = resolveItem(cb);
    if (!addonRoot || !item) return true;

    const { enforceSingle, mustHaveOneSelected } = getAddonConfig(addonRoot);
    const next = enforceSingle ? true : cb.checked;

    if (mustHaveOneSelected && !next) {
      // Revert: single+preselected modes cannot be cleared.
      cb.checked = true;
      setSelected(item, true);
      return true;
    }

    debug('addon toggle change', { next, id: item.dataset.addonVariantId });
    setSelected(item, next);
    if (next && enforceSingle) deselectSiblings(addonRoot, item);
    return true;
  };

  class FlowEngineRuntime extends HTMLElement {
    connectedCallback() {
      this.addEventListener(
        'click',
        (e) => {
          if (this.#handleAddonClick(e)) {
            e.stopPropagation();
          }
        },
        true
      );

      this.addEventListener('change', (e) => {
        const target = e.target;
        if (handleAddonToggleChange(target)) {
          e.stopPropagation();
        }
      });

      this.addEventListener('click', (e) => {
        const btn = e.target?.closest?.('[data-flow-button]');
        if (btn) {
          e.preventDefault();
          this.#handleNav(btn);
        }
      });
    }

    #handleNav(btn) {
      const action = btn.dataset.navigationAction || 'next';
      const steps = Array.from(this.querySelectorAll('[data-flow-step]'));
      const currentIdx = steps.findIndex((s) => !s.hidden);
      const goTo = (idx) => {
        steps.forEach((s, i) => {
          const active = i === idx;
          s.hidden = !active;
          s.toggleAttribute('inert', !active);
          s.setAttribute('aria-hidden', active ? 'false' : 'true');
          s.classList.toggle('flow-step--active', active);
        });
        const url = new URL(window.location.href);
        const stepId = steps[idx]?.dataset?.stepId;
        if (stepId) url.searchParams.set('flow_step', stepId);
        window.history.replaceState(null, '', url);
      };

      if (action === 'previous' && currentIdx > 0) return goTo(currentIdx - 1);
      if (action === 'restart') return goTo(0);
      if (action === 'next' && currentIdx >= 0 && currentIdx < steps.length - 1) return goTo(currentIdx + 1);
    }

    #handleAddonClick(e) {
      const target = e.target;
      const addonRoot = target?.closest?.('[data-flow-addon]');
      if (!addonRoot) return false;
      if (target?.closest?.('[data-flow-addon-quantity]')) return false;

      const item = resolveItem(target);
      if (!item) return false;

      const { enforceSingle, mustHaveOneSelected } = getAddonConfig(addonRoot);

      const directToggle = target?.closest?.('[data-flow-addon-toggle]');
      if (directToggle instanceof HTMLInputElement && directToggle.type === 'checkbox') {
        // Let the browser toggle the checkbox; we will sync on `change`.
        // Still prevent clearing in single+preselected modes.
        if (mustHaveOneSelected && directToggle.checked) return true;
        return false;
      }

      if (directToggle instanceof HTMLElement && directToggle.tagName === 'BUTTON') {
        e.preventDefault();
        const pressed = directToggle.getAttribute('aria-pressed') === 'true';
        if (mustHaveOneSelected && pressed) return true;
        const next = enforceSingle ? true : !pressed;
        debug('addon button toggle', { next, id: item.dataset.addonVariantId });
        setSelected(item, next);
        if (next && enforceSingle) deselectSiblings(addonRoot, item);
        return true;
      }

      e.preventDefault();
      const cb = item.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
      if (cb instanceof HTMLInputElement) {
        const isSelected = cb.checked;
        if (mustHaveOneSelected && isSelected) return true;
        const next = enforceSingle ? true : !isSelected;
        debug('addon row toggle', { next, id: item.dataset.addonVariantId });
        setSelected(item, next);
        if (enforceSingle && next) deselectSiblings(addonRoot, item);
        cb.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      return false;
    }
  }

  // Prefer defining the custom element, but also register a global capture listener
  // because some themes may already define <flow-engine> or prevent upgrade.
  if (!customElements.get('flow-engine')) customElements.define('flow-engine', FlowEngineRuntime);

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target;
      const addonRoot = target?.closest?.('[data-flow-addon]');
      if (addonRoot) {
        // Replicate addon click logic without relying on custom element upgrade.
        if (target?.closest?.('[data-flow-addon-quantity]')) return;
        const item = resolveItem(target);
        if (!item) return;

        const { enforceSingle, mustHaveOneSelected } = getAddonConfig(addonRoot);

        const directToggle = target?.closest?.('[data-flow-addon-toggle]');
        if (directToggle instanceof HTMLInputElement && directToggle.type === 'checkbox') {
          // Let the browser toggle; sync on `change`.
          if (mustHaveOneSelected && directToggle.checked) return;
          return;
        }

        e.preventDefault();
        const cb = item.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
        if (cb instanceof HTMLInputElement) {
          const isSelected = cb.checked;
          if (mustHaveOneSelected && isSelected) return;
          const next = enforceSingle ? true : !isSelected;
          debug('addon row toggle (global)', { next, id: item.dataset.addonVariantId });
          setSelected(item, next);
          if (enforceSingle && next) deselectSiblings(addonRoot, item);
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }

      const flowBtn = target?.closest?.('[data-flow-button]');
      const engine = flowBtn?.closest?.('flow-engine');
      if (flowBtn && engine) {
        e.preventDefault();
        const action = flowBtn.dataset.navigationAction || 'next';
        const steps = Array.from(engine.querySelectorAll('[data-flow-step]'));
        const currentIdx = steps.findIndex((s) => !s.hidden);
        const goTo = (idx) => {
          steps.forEach((s, i) => {
            const active = i === idx;
            s.hidden = !active;
            s.toggleAttribute('inert', !active);
            s.setAttribute('aria-hidden', active ? 'false' : 'true');
            s.classList.toggle('flow-step--active', active);
          });
          const url = new URL(window.location.href);
          const stepId = steps[idx]?.dataset?.stepId;
          if (stepId) url.searchParams.set('flow_step', stepId);
          window.history.replaceState(null, '', url);
        };

        if (action === 'previous' && currentIdx > 0) return goTo(currentIdx - 1);
        if (action === 'restart') return goTo(0);
        if (action === 'next' && currentIdx >= 0 && currentIdx < steps.length - 1) return goTo(currentIdx + 1);
      }
    },
    true
  );

  document.addEventListener(
    'change',
    (e) => {
      handleAddonToggleChange(e.target);
    },
    true
  );
})();

