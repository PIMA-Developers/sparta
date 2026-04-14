/**
 * Flow Engine – Guided purchase flow for TAP.
 * Add-to-cart matches theme behavior (product-form.js): sections in request,
 * CartAddEvent / CartErrorEvent, variant id from variant-picker JSON (not stale Liquid default).
 * Multi-item JSON responses often omit or partially omit `sections`; we then refresh cart sections from the
 * current page URL (Section Rendering API) before opening the drawer so markup matches the updated cart.
 */

import { CartAddEvent, CartErrorEvent, ThemeEvents } from './events.js';
import { cartPerformance } from './performance.js';
import { morphSection, sectionRenderer } from './section-renderer.js';
import { fetchConfig } from './utilities.js';

const cartAddUrl = () => window.Theme?.routes?.cart_add_url || `${window.Shopify?.routes?.root || '/'}cart/add.js`;
const CART_DEBUG_FLAG = 'cart_debug';

function isCartDebugEnabled() {
  try {
    const urlFlag = new URL(window.location.href).searchParams.has(CART_DEBUG_FLAG);
    const storageFlag = window.localStorage?.getItem(CART_DEBUG_FLAG) === '1';
    return urlFlag || storageFlag;
  } catch {
    return false;
  }
}

function cartDebug(...args) {
  if (!isCartDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.debug('[cart_debug]', ...args);
}

/**
 * Whether an addon row is selected (reads live DOM — dataset can be stale).
 * @param {HTMLElement} item
 */
function isAddonRowSelected(item) {
  const checkbox = item.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
  if (checkbox instanceof HTMLInputElement) return checkbox.checked;
  const toggleBtn = item.querySelector('button.flow-addon__toggle-btn[data-flow-addon-toggle]');
  if (toggleBtn) return toggleBtn.getAttribute('aria-pressed') === 'true';
  return item.dataset.addonSelected === 'true';
}

/**
 * Quantity for an addon row (live input, then dataset).
 * @param {HTMLElement} item
 */
function getAddonRowQuantity(item) {
  const qtyInput = item.querySelector('[data-flow-addon-quantity]');
  if (qtyInput instanceof HTMLInputElement) {
    const n = parseInt(qtyInput.value, 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  }
  const fromData = parseInt(item.dataset.addonQuantity, 10);
  return Number.isFinite(fromData) && fromData >= 1 ? fromData : 1;
}
const cartUpdateUrl = () => `${window.Shopify?.routes?.root || '/'}cart/update.js`;

/** @returns {string[]} */
function getCartSectionIds() {
  const ids = [];
  document.querySelectorAll('cart-items-component[data-section-id]').forEach((el) => {
    if (el instanceof HTMLElement && el.dataset.sectionId) ids.push(el.dataset.sectionId);
  });
  return ids;
}

/**
 * Normalizes bundled `sections` from cart/add.js (strings or { html }).
 * @param {unknown} sections
 * @returns {Record<string, string> | undefined}
 */
function normalizeSectionsResponse(sections) {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return undefined;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, val] of Object.entries(sections)) {
    if (typeof val === 'string') {
      out[key] = val;
    } else if (val && typeof val === 'object' && 'html' in val && typeof val.html === 'string') {
      out[key] = val.html;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Re-renders cart-related sections using the current page URL (not /cart) so the header drawer markup matches session cart.
 * @param {string[]} sectionIds
 */
async function refreshCartSectionsFromCurrentPage(sectionIds) {
  const unique = [...new Set(sectionIds)].filter(Boolean);
  if (!unique.length) return;
  /* `renderSection` does not await `morphSection`; we must await morph so the drawer opens with updated HTML. */
  await Promise.all(
    unique.map(async (id) => {
      const html = await sectionRenderer.getSectionHTML(id, false);
      await morphSection(id, html);
    })
  );
}

/**
 * @param {Record<string, string> | undefined} sections
 * @param {string[]} sectionIds
 */
function cartAddSectionsAreComplete(sections, sectionIds) {
  if (!sections || !sectionIds.length) return false;
  return sectionIds.every((id) => typeof sections[id] === 'string');
}

class FlowEngine extends HTMLElement {
  constructor() {
    super();
    this._stack = [];
    this._steps = [];
    this._stepMap = new Map();
    this._pendingAttributes = {};
    this._isNavigating = false;
    /** @type {AbortController | undefined} */
    this._flowAbort;
  }

  connectedCallback() {
    this._flowAbort = new AbortController();
    const { signal } = this._flowAbort;

    this._sectionId = this.dataset.sectionId;
    this._transition = this.dataset.transition || 'fade';
    this._transitionSpeed = parseInt(this.dataset.transitionSpeed, 10) || 300;
    this._transitionEasing = this.dataset.transitionEasing || 'ease';
    this._errorMessage = this.dataset.errorMessage || 'Não foi possível salvar. Tente de novo.';

    this._stepsContainer = this.querySelector('[data-flow-steps-container]');
    this._successContainer = this.querySelector('[data-flow-success]');
    this._progressEl = this.querySelector('[data-flow-progress]');
    this._progressFill = this.querySelector('[data-flow-progress-fill]');
    this._progressSteps = this.querySelector('[data-flow-progress-steps]');
    this._errorEl = this.querySelector('[data-flow-error]');
    this._errorText = this.querySelector('[data-flow-error-text]');

    document.addEventListener(ThemeEvents.variantUpdate, this.#onVariantUpdateDocument, { signal });

    this._collectSteps();
    this._bindEvents();
    this._applyTransitionVars();
    this._restoreFromURL();
  }

  disconnectedCallback() {
    this._flowAbort?.abort();
  }

  /** @param {Event} event */
  #onVariantUpdateDocument = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !this.contains(target)) return;
    const form = target.closest('[data-flow-product-form]');
    if (!form || !this.contains(form)) return;
    const detail = /** @type {CustomEvent} */ (event).detail;
    const resource = detail?.resource;
    if (resource && typeof resource.price === 'number') {
      form.dataset.price = String(resource.price);
    }
    this._updatePriceSummary();
  };

  _collectSteps() {
    const stepEls = this._stepsContainer?.querySelectorAll(':scope > [data-flow-step]') || [];
    this._steps = Array.from(stepEls);
    this._stepMap.clear();
    this._steps.forEach((el, idx) => {
      const id = el.dataset.stepId;
      if (id) this._stepMap.set(id, idx);
    });
  }

  _bindEvents() {
    // Capture-phase handler for addons: robust against stopPropagation inside blocks/layout.
    this.addEventListener(
      'click',
      (e) => {
        if (this._handleAddonInteraction(e)) {
          e.stopPropagation();
        }
      },
      true
    );

    this.addEventListener('click', (e) => {
      // Addon selection (delegated): do not depend on inline block scripts.
      if (this._handleAddonInteraction(e)) return;

      const btn = e.target.closest('[data-flow-button]');
      if (btn) {
        e.preventDefault();
        this._handleNavButton(btn);
        return;
      }

      const academyOption = e.target.closest('[data-flow-academy-option]');
      if (academyOption) {
        e.preventDefault();
        this._handleAcademyOption(academyOption);
        return;
      }

      const addToCartBtn = e.target.closest('[data-flow-add-to-cart]');
      if (addToCartBtn) {
        e.preventDefault();
        this._handleAddToCart(addToCartBtn);
        return;
      }
    });

    this.addEventListener('change', (e) => {
      // Sync addon dataset when underlying controls change.
      this._handleAddonControlChange(e);

      if (e.target.closest('[data-flow-addon]')) this._updatePriceSummary();
      if (e.target.closest('[data-flow-variant-change]')) this._updatePriceSummary();
    });
  }

  /**
   * Delegated click handler for addon cards/toggles.
   * Returns true when it handled the click (and prevented default).
   * @param {MouseEvent} e
   * @returns {boolean}
   */
  _handleAddonInteraction(e) {
    const target = /** @type {any} */ (e.target);
    const inAddon = target?.closest ? target.closest('[data-flow-addon]') : null;
    if (!inAddon || !(inAddon instanceof HTMLElement)) return false;
    cartDebug('addon click captured', {
      tag: target?.tagName,
      className: target?.className,
      selectionMode: inAddon.dataset.selectionMode,
      addonType: inAddon.dataset.addonType,
    });

    // Don't toggle when editing quantity.
    if (target?.closest && target.closest('[data-flow-addon-quantity]')) return false;

    /**
     * Some theme/layout wrappers may introduce nested `.flow-addon__item` elements.
     * We must resolve the *real* row element that owns `data-addon-variant-id`.
     * @type {HTMLElement | null}
     */
    let item = target?.closest ? target.closest('[data-addon-variant-id]') : null;
    if (!item && target?.closest) item = target.closest('.flow-addon__item');
    if (!item && typeof e.composedPath === 'function') {
      for (const el of e.composedPath()) {
        if (
          el instanceof HTMLElement &&
          (el.classList.contains('flow-addon__item') || el.hasAttribute('data-addon-variant-id'))
        ) {
          item = el;
          break;
        }
      }
    }
    if (!item) return false;
    if (!item.hasAttribute('data-addon-variant-id')) {
      const owned = item.querySelector('[data-addon-variant-id]');
      if (owned instanceof HTMLElement) item = owned;
    }
    if (!item.hasAttribute('data-addon-variant-id')) return false;

    const selectionMode = inAddon.dataset.selectionMode || 'multiple';
    const enforceSingle = selectionMode === 'single';
    const preselectMode = inAddon.dataset.preselectMode || 'none';
    const mustHaveOneSelected = enforceSingle && preselectMode !== 'none';

    const setSelected = (it, selected) => {
      if (!(it instanceof HTMLElement)) return;
      it.dataset.addonSelected = String(Boolean(selected));
      const cb = it.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
      if (cb instanceof HTMLInputElement) cb.checked = Boolean(selected);
      const btn = it.querySelector('button.flow-addon__toggle-btn[data-flow-addon-toggle]');
      if (btn instanceof HTMLElement) btn.setAttribute('aria-pressed', String(Boolean(selected)));
    };

    const deselectSiblings = () => {
      if (!enforceSingle) return;
      inAddon.querySelectorAll('[data-addon-variant-id]').forEach((other) => {
        if (other !== item) setSelected(other, false);
      });
    };

    // If click is directly on a toggle control (button/checkbox or inside), handle it ourselves.
    const directToggle = target?.closest ? target.closest('[data-flow-addon-toggle]') : null;
    if (directToggle) {
      e.preventDefault();
      if (directToggle instanceof HTMLInputElement && directToggle.type === 'checkbox') {
        const isCurrentlySelected = directToggle.checked;
        if (mustHaveOneSelected && isCurrentlySelected) {
          // Can't deselect the only/active option in single-select mode.
          return true;
        }
        const next = enforceSingle ? true : !directToggle.checked;
        cartDebug('direct checkbox toggle', { next, disabled: directToggle.disabled, readOnly: directToggle.readOnly });
        directToggle.checked = next;
        setSelected(item, next);
        if (next) deselectSiblings();
        directToggle.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (directToggle instanceof HTMLElement) {
        const pressed = directToggle.getAttribute('aria-pressed') === 'true';
        if (mustHaveOneSelected && pressed) {
          // Can't deselect the only/active option in single-select mode.
          return true;
        }
        const next = enforceSingle ? true : !pressed;
        cartDebug('direct button toggle', { next });
        directToggle.setAttribute('aria-pressed', String(next));
        setSelected(item, next);
        if (next) deselectSiblings();
        this._updatePriceSummary();
      }
      return true;
    }

    const checkbox = item.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
    if (checkbox instanceof HTMLInputElement) {
      e.preventDefault();
      const isCurrentlySelected = checkbox.checked;
      if (mustHaveOneSelected && isCurrentlySelected) return true;
      const next = enforceSingle ? true : !checkbox.checked;
      checkbox.checked = next;
      setSelected(item, next);
      if (next) deselectSiblings();
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    const toggleBtn = item.querySelector('button.flow-addon__toggle-btn[data-flow-addon-toggle]');
    if (toggleBtn instanceof HTMLElement) {
      e.preventDefault();
      const pressed = toggleBtn.getAttribute('aria-pressed') === 'true';
      if (mustHaveOneSelected && pressed) return true;
      const next = enforceSingle ? true : !pressed;
      toggleBtn.setAttribute('aria-pressed', String(next));
      setSelected(item, next);
      if (next) deselectSiblings();
      this._updatePriceSummary();
      return true;
    }

    return false;
  }

  /**
   * Delegated change handler to keep dataset in sync with controls.
   * @param {Event} e
   */
  _handleAddonControlChange(e) {
    const target = /** @type {any} */ (e.target);
    const inAddon = target?.closest ? target.closest('[data-flow-addon]') : null;
    if (!inAddon || !(inAddon instanceof HTMLElement)) return;

    const toggleEl = target?.closest ? target.closest('[data-flow-addon-toggle]') : null;
    if (!toggleEl) return;

    const item = toggleEl.closest('.flow-addon__item');
    if (!item) return;

    if (toggleEl instanceof HTMLInputElement && toggleEl.type === 'checkbox') {
      item.dataset.addonSelected = String(toggleEl.checked);
    } else if (toggleEl instanceof HTMLElement) {
      item.dataset.addonSelected = String(toggleEl.getAttribute('aria-pressed') === 'true');
    }
  }

  async _handleNavButton(btn) {
    if (this._isNavigating) return;

    const action = btn.dataset.navigationAction || 'next';
    const attrKey = btn.dataset.attributeKey;
    const attrValue = btn.dataset.attributeValue;

    if (attrKey) {
      this._pendingAttributes[attrKey] = attrValue || '';
    }

    switch (action) {
      case 'next':
        await this._goNext();
        break;
      case 'previous':
        await this._goPrevious();
        break;
      case 'restart':
        await this._goRestart();
        break;
      case 'skip': {
        const offset = parseInt(btn.dataset.navigationOffset, 10) || 2;
        await this._goSkip(offset);
        break;
      }
      case 'go_to_step': {
        const targetId = btn.dataset.targetStepId;
        await this._goToStepById(targetId);
        break;
      }
    }
  }

  _getCurrentIndex() {
    if (this._stack.length === 0) return -1;
    return this._stack[this._stack.length - 1];
  }

  async _goNext() {
    const current = this._getCurrentIndex();
    const next = current + 1;
    if (next >= this._steps.length) return;
    await this._navigateTo(next);
  }

  async _goPrevious() {
    if (this._stack.length <= 1) return;
    this._stack.pop();
    const prev = this._stack[this._stack.length - 1];
    await this._showStep(prev, 'back');
  }

  async _goRestart() {
    this._stack = [];
    this._pendingAttributes = {};
    await this._navigateTo(0);
  }

  async _goSkip(offset) {
    const current = this._getCurrentIndex();
    const target = current + offset;
    if (target >= this._steps.length || target < 0) return;
    await this._navigateTo(target);
  }

  async _goToStepById(stepId) {
    if (!stepId) return;
    const idx = this._stepMap.get(stepId);
    if (idx === undefined) {
      console.error(`[flow-engine] Step ID "${stepId}" not found.`);
      if (window.Shopify?.designMode) {
        this._showError(`Step ID "${stepId}" não encontrado.`);
      }
      return;
    }
    await this._navigateTo(idx);
  }

  async _navigateTo(index) {
    if (index < 0 || index >= this._steps.length) return;

    this._isNavigating = true;
    const success = await this._persistAttributes();
    if (!success) {
      this._isNavigating = false;
      return;
    }

    this._stack.push(index);
    await this._showStep(index, 'forward');
    this._isNavigating = false;
  }

  async _showStep(index, direction = 'forward') {
    const targetStep = this._steps[index];
    if (!targetStep) return;

    const currentStep = this._steps.find((s) => !s.hidden && s !== targetStep);

    if (currentStep && this._transition !== 'none') {
      currentStep.classList.add(direction === 'back' ? 'flow-step--exit-back' : 'flow-step--exit-forward');
      currentStep.classList.remove('flow-step--active');
      await this._wait(this._transitionSpeed);
      currentStep.classList.remove('flow-step--exit-back', 'flow-step--exit-forward');
    }

    this._steps.forEach((s) => {
      s.hidden = true;
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('inert', '');
      s.classList.remove(
        'flow-step--active',
        `flow-step--transition-${this._transition}`,
        'flow-step--exit-back',
        'flow-step--exit-forward'
      );
    });

    if (this._successContainer) {
      this._successContainer.hidden = true;
      this._successContainer.setAttribute('aria-hidden', 'true');
    }

    targetStep.hidden = false;
    targetStep.removeAttribute('inert');
    targetStep.setAttribute('aria-hidden', 'false');

    if (this._transition !== 'none') {
      targetStep.classList.add(`flow-step--transition-${this._transition}`);
      void targetStep.offsetHeight;
      requestAnimationFrame(() => {
        targetStep.classList.add('flow-step--active');
      });
    }

    this._updateProgress();
    this._updateURL();
    this._updatePriceSummary();

    targetStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  _showSuccess() {
    this._steps.forEach((s) => {
      s.hidden = true;
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('inert', '');
      s.classList.remove('flow-step--active');
    });

    if (this._successContainer) {
      const successStep = this._successContainer.querySelector('[data-flow-step]');
      if (successStep) {
        this._successContainer.hidden = false;
        this._successContainer.setAttribute('aria-hidden', 'false');
        successStep.hidden = false;
        successStep.removeAttribute('inert');
        successStep.setAttribute('aria-hidden', 'false');
        return true;
      }
    }
    return false;
  }

  async _handleAcademyOption(el) {
    if (this._isNavigating) return;

    const attrValue = el.dataset.attributeValue;
    if (attrValue) {
      this._pendingAttributes['fluxo_academia'] = attrValue;
    }

    await this._goNext();
  }

  /**
   * Current variant id from Horizon variant-picker (authoritative) or hidden input / default.
   * @param {HTMLElement} form
   * @returns {string}
   */
  _resolveMainVariantId(form) {
    const picker = form.querySelector('variant-picker');
    if (picker) {
      const jsonEl = picker.querySelector('script[type="application/json"]');
      if (jsonEl?.textContent) {
        try {
          const v = JSON.parse(jsonEl.textContent.trim());
          if (v?.id != null) return String(v.id);
        } catch {
          /* ignore */
        }
      }
      const checked = picker.querySelector('fieldset input[type="radio"]:checked');
      if (checked instanceof HTMLInputElement && checked.dataset.variantId) {
        return checked.dataset.variantId;
      }
      const select = picker.querySelector('select');
      if (select) {
        const opt = select.options[select.selectedIndex];
        if (opt?.dataset?.variantId) return opt.dataset.variantId;
      }
    }

    const hidden = form.querySelector('input[name="id"]');
    if (hidden instanceof HTMLInputElement && hidden.value) return hidden.value;

    return form.dataset.defaultVariantId || '';
  }

  async _handleAddToCart(btn) {
    if (this._isNavigating) return;
    this._isNavigating = true;

    const form = btn.closest('[data-flow-product-form]');
    if (!form) {
      this._isNavigating = false;
      return;
    }

    const validationError = this._validatePropertyFields(form);
    if (validationError) {
      this._showError(validationError);
      this._isNavigating = false;
      return;
    }

    const items = this._collectCartItems(form);
    if (items.length === 0) {
      this._showError('Nenhum produto para adicionar.');
      this._isNavigating = false;
      return;
    }

    await this._buildAndSaveNote();
    const attrSuccess = await this._persistAttributes();
    if (!attrSuccess) {
      this._isNavigating = false;
      return;
    }

    const sectionIds = getCartSectionIds();
    /** @type {Record<string, unknown>} */
    const payload = { items };
    if (sectionIds.length > 0) {
      payload.sections = sectionIds.join(',');
    }
    /* No sections_url: same as product-form.js — Shopify uses Referer. Never use /cart here:
       header-actions.liquid omits cart-drawer on template cart, so bundled HTML would be wrong. */

    btn.disabled = true;
    btn.classList.add('flow-button--loading');

    const perfMarker = cartPerformance.createStartingMarker('add:user-action');

    try {
      const fetchCfg = fetchConfig('json', {
        body: JSON.stringify(payload),
        headers: { Accept: 'text/html' },
      });

      const addUrl = window.Theme?.routes?.cart_add_url || cartAddUrl();
      const debug = isCartDebugEnabled();
      if (debug) {
        // eslint-disable-next-line no-console
        console.groupCollapsed('[cart_debug] flow-engine add-to-cart');
        // eslint-disable-next-line no-console
        console.log('addUrl', addUrl);
        // eslint-disable-next-line no-console
        console.log('payload.items', payload.items);
        // eslint-disable-next-line no-console
        console.log('payload.sections', payload.sections);
      }
      const res = await fetch(addUrl, { ...fetchCfg, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('response.ok', res.ok, 'status', res.status);
        // eslint-disable-next-line no-console
        console.log('response.keys', data && typeof data === 'object' ? Object.keys(data) : data);
        // eslint-disable-next-line no-console
        console.log('response.sections.keys', data?.sections && typeof data.sections === 'object' ? Object.keys(data.sections) : data?.sections);
      }

      if (data.status || !res.ok) {
        const msg =
          (typeof data.message === 'string' && data.message) ||
          (typeof data.description === 'string' && data.description) ||
          (typeof data.errors === 'string' && data.errors) ||
          'Erro ao adicionar ao carrinho.';
        window.dispatchEvent(new CartErrorEvent(this._sectionId || 'flow-engine', msg));
        this._showError(msg);
        return;
      }

      const mainVariantId = this._resolveMainVariantId(form);
      const itemCount = items.reduce((acc, line) => acc + (line.quantity || 1), 0);
      const sectionsResponse = normalizeSectionsResponse(data.sections);
      const idsForCartUi = getCartSectionIds();
      const sectionsComplete = cartAddSectionsAreComplete(sectionsResponse, idsForCartUi);

      if (!sectionsComplete) {
        if (debug) {
          // eslint-disable-next-line no-console
          console.log('sections incomplete; refreshing via Section Rendering API', idsForCartUi);
        }
        await refreshCartSectionsFromCurrentPage(idsForCartUi);
      }

      this.dispatchEvent(
        new CartAddEvent({}, mainVariantId || 'flow-engine', {
          source: 'product-form-component',
          itemCount,
          productId: form.dataset.productId,
          sections: sectionsComplete ? sectionsResponse : undefined,
          skipSectionMorph: !sectionsComplete,
        })
      );
      if (debug) {
        // eslint-disable-next-line no-console
        console.log('dispatched CartAddEvent', { itemCount, mainVariantId, sectionsComplete, idsForCartUi });
        // eslint-disable-next-line no-console
        console.groupEnd();
      }

      this._showSuccess();
    } catch {
      this._showError('Erro de conexão. Tente novamente.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('flow-button--loading');
      this._isNavigating = false;
      cartPerformance.measureFromMarker(perfMarker);
    }
  }

  _validatePropertyFields(form) {
    const fields = form.querySelectorAll('[data-flow-property][data-required="true"]');
    for (const field of fields) {
      const input = field.querySelector('input, textarea, select');
      if (input && !input.value.trim()) {
        const label = field.dataset.propertyLabel || field.dataset.propertyName || 'Campo';
        input.focus();
        return `O campo "${label}" é obrigatório.`;
      }
    }
    return null;
  }

  /**
   * @param {HTMLElement} form
   * @returns {Array<{ id: number, quantity: number, properties?: Record<string, string> }>}
   */
  _collectCartItems(form) {
    const items = [];

    const variantId = this._resolveMainVariantId(form);
    if (!variantId) return items;

    const properties = {};
    form.querySelectorAll('[data-flow-property]').forEach((field) => {
      const name = field.dataset.propertyName;
      const input = field.querySelector('input, textarea, select');
      if (name && input && input.value.trim()) {
        properties[name] = input.value.trim();
      }
    });

    const quantityInput = form.querySelector('[data-flow-main-quantity]');
    const mainQty = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;

    const mainId = parseInt(variantId, 10);
    if (!Number.isFinite(mainId)) return items;

    const mainLine = {
      id: mainId,
      quantity: mainQty,
    };
    if (Object.keys(properties).length > 0) {
      mainLine.properties = properties;
    }
    items.push(mainLine);

    form.querySelectorAll('[data-flow-addon][data-addon-type="product"]').forEach((addon) => {
      addon.querySelectorAll('.flow-addon__item').forEach((item) => {
        if (!isAddonRowSelected(item)) return;
        const vid = item.dataset.addonVariantId;
        const addonId = parseInt(vid, 10);
        if (!Number.isFinite(addonId)) return;
        items.push({ id: addonId, quantity: getAddonRowQuantity(item) });
      });
    });

    form.querySelectorAll('[data-flow-addon][data-addon-type="service"]').forEach((addon) => {
      addon.querySelectorAll('.flow-addon__item').forEach((item) => {
        if (!isAddonRowSelected(item)) return;
        const vid = item.dataset.addonVariantId;
        const addonId = parseInt(vid, 10);
        if (!Number.isFinite(addonId)) return;
        const propKey = item.dataset.servicePropertyKey || '_service_type';
        const propValue = item.dataset.servicePropertyValue || 'service';
        const displayName = item.dataset.serviceDisplayName || '';
        const serviceProps = { [propKey]: propValue };
        if (displayName) serviceProps['_display_name'] = displayName;
        items.push({
          id: addonId,
          quantity: 1,
          properties: serviceProps,
        });
      });
    });

    return items;
  }

  async _persistAttributes() {
    if (Object.keys(this._pendingAttributes).length === 0) return true;

    try {
      const res = await fetch(cartUpdateUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attributes: this._pendingAttributes }),
      });

      if (!res.ok) {
        this._showError(this._errorMessage);
        return false;
      }

      this._pendingAttributes = {};
      return true;
    } catch {
      this._showError(this._errorMessage);
      return false;
    }
  }

  async _buildAndSaveNote() {
    const parts = [];
    this._stack.forEach((idx) => {
      const step = this._steps[idx];
      if (!step) return;
      const label = step.dataset.stepId || `Etapa ${idx + 1}`;
      parts.push(label);
    });

    const note = parts.join(' > ');

    try {
      await fetch(cartUpdateUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
    } catch {
      /* non-blocking */
    }
  }

  _updatePriceSummary() {
    const currentIdx = this._getCurrentIndex();
    if (currentIdx < 0) return;

    const step = this._steps[currentIdx];
    if (!step) return;

    const form = step.querySelector('[data-flow-product-form]');
    if (!form) return;

    let total = parseInt(form.dataset.price, 10) || 0;

    const mainQtyInput = form.querySelector('[data-flow-main-quantity]');
    const mainQty = mainQtyInput ? parseInt(mainQtyInput.value, 10) || 1 : 1;
    total *= mainQty;

    form.querySelectorAll('.flow-addon__item[data-price]').forEach((el) => {
      if (!isAddonRowSelected(el)) return;
      const unit = parseInt(el.dataset.price, 10) || 0;
      const qty = getAddonRowQuantity(el);
      total += unit * qty;
    });

    const summaryEl = form.querySelector('[data-flow-price-summary]');
    if (summaryEl) {
      summaryEl.textContent = this._formatMoney(total);
    }
  }

  _formatMoney(cents) {
    if (window.Shopify?.formatMoney) {
      return window.Shopify.formatMoney(cents);
    }
    const amount = (cents / 100).toFixed(2);
    return `R$ ${amount.replace('.', ',')}`;
  }

  _updateProgress() {
    if (!this._progressEl) return;

    const depth = this._stack.length;
    const maxDepth = Math.max(this._steps.length, depth + 2);
    const pct = Math.min(Math.round((depth / maxDepth) * 100), 100);

    if (this._progressFill) {
      this._progressFill.style.width = `${pct}%`;
    }

    if (this._progressSteps) {
      const totalDots = Math.max(this._steps.length, 3);
      let html = '';
      for (let i = 0; i < totalDots; i++) {
        let cls = 'flow-progress__step-dot';
        if (i < depth) cls += ' flow-progress__step-dot--visited';
        if (i === depth - 1) cls += ' flow-progress__step-dot--active';
        html += `<span class="${cls}"></span>`;
      }
      this._progressSteps.innerHTML = html;
    }
  }

  _updateURL() {
    const idx = this._getCurrentIndex();
    const step = this._steps[idx];
    if (!step) return;

    const stepId = step.dataset.stepId || String(idx);
    const url = new URL(window.location.href);
    url.searchParams.set('flow_step', stepId);
    window.history.replaceState(null, '', url);
  }

  _restoreFromURL() {
    const url = new URL(window.location.href);
    const stepParam = url.searchParams.get('flow_step');

    if (stepParam) {
      const idx = this._stepMap.get(stepParam);
      if (idx !== undefined) {
        this._stack.push(idx);
        this._showStep(idx, 'forward');
        return;
      }
      const numIdx = parseInt(stepParam, 10);
      if (!Number.isNaN(numIdx) && numIdx >= 0 && numIdx < this._steps.length) {
        this._stack.push(numIdx);
        this._showStep(numIdx, 'forward');
        return;
      }
    }

    if (this._steps.length > 0) {
      this._stack.push(0);
      this._showStep(0, 'forward');
    }
  }

  _showError(msg) {
    if (this._errorEl && this._errorText) {
      this._errorText.textContent = msg;
      this._errorEl.hidden = false;
      setTimeout(() => {
        this._errorEl.hidden = true;
      }, 5000);
    }
  }

  _applyTransitionVars() {
    this.style.setProperty('--flow-transition-speed', `${this._transitionSpeed}ms`);
    this.style.setProperty('--flow-transition-easing', this._transitionEasing);
  }

  _wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

if (!customElements.get('flow-engine')) {
  customElements.define('flow-engine', FlowEngine);
}
