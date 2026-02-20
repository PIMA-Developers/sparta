/**
 * Flow Engine – Guided purchase flow for TAP.
 *
 * Custom element <flow-engine> manages:
 *   - Step navigation (show/hide via stack)
 *   - Cart attribute persistence (POST cart/update.js)
 *   - Multi-product add-to-cart (POST cart/add.js)
 *   - Progress bar (estimated percentage)
 *   - URL state (hash-based)
 *   - Transition animations (fade / slide / none)
 *   - Dynamic price summary
 */

const ROUTES = () => window.Shopify?.routes?.root || '/';


class FlowEngine extends HTMLElement {
  constructor() {
    super();
    this._stack = [];
    this._steps = [];
    this._stepMap = new Map();
    this._pendingAttributes = {};
    this._isNavigating = false;
  }

  connectedCallback() {
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

    this._collectSteps();
    this._bindEvents();
    this._applyTransitionVars();
    this._restoreFromURL();
  }

  /* ── Step collection ────────────────────────────────────── */

  _collectSteps() {
    const stepEls = this._stepsContainer?.querySelectorAll(':scope > [data-flow-step]') || [];
    this._steps = Array.from(stepEls);
    this._stepMap.clear();
    this._steps.forEach((el, idx) => {
      const id = el.dataset.stepId;
      if (id) this._stepMap.set(id, idx);
    });
  }

  /* ── Event binding ──────────────────────────────────────── */

  _bindEvents() {
    this.addEventListener('click', (e) => {
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

      // --- Addons: delegação (funciona mesmo após re-render do variant-picker) ---

      // Toggle button
      const toggleBtn = e.target.closest('button[data-flow-addon-toggle]');
      if (toggleBtn) {
        e.preventDefault();
        const item = toggleBtn.closest('.flow-addon__item');
        if (!item) return;

        const isPressed = toggleBtn.getAttribute('aria-pressed') === 'true';
        const next = !isPressed;

        toggleBtn.setAttribute('aria-pressed', String(next));
        item.dataset.addonSelected = String(next);

        this._updatePriceSummary();
        return;
      }

      // Clique no card inteiro alterna checkbox/toggle
      const addonItem = e.target.closest('.flow-addon__item');
      if (addonItem && addonItem.closest('[data-flow-addon]')) {
        const checkbox = addonItem.querySelector('input[type="checkbox"][data-flow-addon-toggle]');
        const btn = addonItem.querySelector('button[data-flow-addon-toggle]');

        // Se clicou direto no input, deixa o change cuidar
        if (checkbox && e.target === checkbox) return;

        if (btn) {
          e.preventDefault();
          const isPressed = btn.getAttribute('aria-pressed') === 'true';
          const next = !isPressed;
          btn.setAttribute('aria-pressed', String(next));
          addonItem.dataset.addonSelected = String(next);
          this._updatePriceSummary();
          return;
        }

        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          addonItem.dataset.addonSelected = String(checkbox.checked);
          this._updatePriceSummary();
          return;
        }
      }
    });

    this.addEventListener('flow:recalc', () => {
      this._updatePriceSummary();
    });

    this.addEventListener('change', (e) => {
      this.addEventListener('change', (e) => {
        // Checkbox addon: refletir estado no dataset
        const addonCheckbox = e.target.closest('input[type="checkbox"][data-flow-addon-toggle]');
        if (addonCheckbox) {
          const item = addonCheckbox.closest('.flow-addon__item');
          if (item) item.dataset.addonSelected = String(addonCheckbox.checked);
          this._updatePriceSummary();
          return;
        }

        // Quantidade addon
        const qtyInput = e.target.closest('[data-flow-addon-quantity]');
        if (qtyInput) {
          const item = qtyInput.closest('.flow-addon__item');
          if (item) item.dataset.addonQuantity = qtyInput.value || '1';
          this._updatePriceSummary();
          return;
        }

        // fallback
        const addon = e.target.closest('[data-flow-addon]');
        if (addon) this._updatePriceSummary();

        const variantInput = e.target.closest('[data-flow-variant-change]');
        if (variantInput) this._updatePriceSummary();
      });

      const variantInput = e.target.closest('[data-flow-variant-change]');
      if (variantInput) this._updatePriceSummary();
    });

    this.addEventListener('variant:update', (e) => {
      const variant = e?.detail?.resource;
      if (!variant) return;

      // pega o form do flow da forma mais robusta
      const form = (e.target instanceof Element)
        ? e.target.closest('[data-flow-product-form]')
        : null;

      // fallback: se o target não estiver dentro, tenta achar o primeiro form no step atual
      const resolvedForm = form || this.querySelector('[data-flow-product-form]');
      if (!resolvedForm) return;

      // price pode vir como number, string, ou em estruturas diferentes dependendo do componente
      let priceCents = 0;

      if (variant.price != null) {
        priceCents = parseInt(variant.price, 10);
      } else if (variant.price?.amount != null) {
        priceCents = parseInt(variant.price.amount, 10);
      } else if (variant.compare_at_price != null) {
        // não é o ideal, mas evita NaN em casos estranhos
        priceCents = parseInt(variant.compare_at_price, 10);
      }

      if (!Number.isFinite(priceCents)) priceCents = 0;

      resolvedForm.dataset.price = String(priceCents);

      // opcional (ajuda outros fluxos que leem defaultVariantId)
      if (variant.id != null) {
        resolvedForm.dataset.defaultVariantId = String(variant.id);
      }

      this._updatePriceSummary();
    });
  }

  /* ── Navigation ─────────────────────────────────────────── */

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
      if (Shopify?.designMode) {
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

  /* ── Step display ───────────────────────────────────────── */

  async _showStep(index, direction = 'forward') {
    const targetStep = this._steps[index];
    if (!targetStep) return;

    const currentStep = this._steps.find(
      (s) => !s.hidden && s !== targetStep
    );

    if (currentStep && this._transition !== 'none') {
      currentStep.classList.add(
        direction === 'back' ? 'flow-step--exit-back' : 'flow-step--exit-forward'
      );
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
      // Force reflow for transition
      void targetStep.offsetHeight;
      requestAnimationFrame(() => {
        targetStep.classList.add('flow-step--active');
      });
    }

    this._updateProgress();
    this._updateURL();
    this._updatePriceSummary();

    const rect = targetStep.getBoundingClientRect();
    if (rect.top < 0) {
      targetStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

  /* ── Academy option ─────────────────────────────────────── */

  async _handleAcademyOption(el) {
    if (this._isNavigating) return;

    const attrValue = el?.dataset?.attributeValue;
    if (attrValue) {
      this._pendingAttributes["fluxo_academia"] = attrValue;
    }

    const targetStepId = el?.dataset?.targetStepId;

    // If a target step is defined, go directly to that step.
    // Otherwise keep current behavior: go to next.
    if (targetStepId) {
      await this._goToStepById(targetStepId);
      return;
    }

    await this._goNext();
  }

  /* ── Add to cart (multi-product) ────────────────────────── */

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

    btn.disabled = true;
    btn.classList.add('flow-button--loading');

    try {
      const res = await fetch(`${ROUTES()}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.description || data.message || 'Erro ao adicionar ao carrinho.';
        this._showError(msg);
        return;
      }

      const shown = this._showSuccess();

      this._dispatchCartAdd();

      if (!shown) {
        this._openCartDrawer();
      } else {
        setTimeout(() => this._openCartDrawer(), 2000);
      }
    } catch {
      this._showError('Erro de conexão. Tente novamente.');
    } finally {
      btn.disabled = false;
      btn.classList.remove('flow-button--loading');
      this._isNavigating = false;
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

  _collectCartItems(form) {
    const items = [];

    // Main product variant
    const variantInput = form.querySelector('input[name="id"], [ref="variantId"]');
    const defaultVariantId = form.dataset.defaultVariantId;
    const variantId = variantInput?.value || defaultVariantId;

    if (!variantId) return items;

    // Collect properties from _flow-property-field blocks
    const properties = {};
    const propertyFields = form.querySelectorAll('[data-flow-property]');
    propertyFields.forEach((field) => {
      const name = field.dataset.propertyName;
      const input = field.querySelector('input, textarea, select');
      if (name && input && input.value.trim()) {
        properties[name] = input.value.trim();
      }
    });

    // Main product
    const quantityInput = form.querySelector('[data-flow-main-quantity]');
    const mainQty = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;

    items.push({
      id: parseInt(variantId, 10),
      quantity: mainQty,
      properties: Object.keys(properties).length > 0 ? properties : undefined,
    });

    // Addons (type: product)
    const addonEls = form.querySelectorAll('[data-flow-addon][data-addon-type="product"]');
    addonEls.forEach((addon) => {
      const selected = addon.querySelectorAll('[data-addon-selected="true"]');
      selected.forEach((item) => {
        const vid = item.dataset.addonVariantId;
        const qty = parseInt(item.dataset.addonQuantity, 10) || 1;
        if (vid) {
          items.push({ id: parseInt(vid, 10), quantity: qty });
        }
      });
    });

    // Services
    const serviceEls = form.querySelectorAll('[data-flow-addon][data-addon-type="service"]');
    serviceEls.forEach((addon) => {
      const selected = addon.querySelectorAll('[data-addon-selected="true"]');
      selected.forEach((item) => {
        const vid = item.dataset.addonVariantId;
        const propKey = item.dataset.servicePropertyKey || '_service_type';
        const propValue = item.dataset.servicePropertyValue || 'service';
        const displayName = item.dataset.serviceDisplayName || '';
        if (vid) {
          const serviceProps = { [propKey]: propValue };
          if (displayName) serviceProps['_display_name'] = displayName;
          items.push({
            id: parseInt(vid, 10),
            quantity: 1,
            properties: serviceProps,
          });
        }
      });
    });

    return items;
  }

  /* ── Cart attributes persistence ────────────────────────── */

  async _persistAttributes() {
    if (Object.keys(this._pendingAttributes).length === 0) return true;

    try {
      const res = await fetch(`${ROUTES()}cart/update.js`, {
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

  /* ── Cart note (fluxo_resumo) ───────────────────────────── */

  async _buildAndSaveNote() {
    const parts = [];

    const currentStep = this._steps[this._getCurrentIndex()];
    if (!currentStep) return;

    // Walk the stack to build the summary
    this._stack.forEach((idx) => {
      const step = this._steps[idx];
      if (!step) return;
      const label = step.dataset.stepId || `Etapa ${idx + 1}`;
      parts.push(label);
    });

    const note = parts.join(' > ');

    try {
      await fetch(`${ROUTES()}cart/update.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
    } catch {
      // Non-blocking; note is informational
    }
  }

  /* ── Price summary ──────────────────────────────────────── */

  _updatePriceSummary() {
    const currentIdx = this._getCurrentIndex();
    if (currentIdx < 0) return;

    const step = this._steps[currentIdx];
    if (!step) return;

    const form = step.querySelector('[data-flow-product-form]');
    if (!form) return;

    // Se o resumo estiver desligado no bloco, não tem o que atualizar
    const summaryEl = form.querySelector('[data-flow-price-summary]');
    if (!summaryEl) return;

    let total = 0;

    // Main product (preço * quantidade)
    const mainPrice = parseInt(form.dataset.price, 10) || 0;
    const mainQtyEl = form.querySelector('[data-flow-main-quantity]');
    const mainQty = mainQtyEl ? (parseInt(mainQtyEl.value, 10) || 1) : 1;
    total += mainPrice * mainQty;

    // Addons selecionados (preço * quantidade)
    const selectedAddons = step.querySelectorAll('[data-addon-selected="true"][data-price]');
    selectedAddons.forEach((el) => {
      const price = parseInt(el.dataset.price, 10) || 0;
      const qty = parseInt(el.dataset.addonQuantity, 10) || 1;
      total += price * qty;
    });

    const safeFormat =
      (typeof this._formatMoney === 'function' && this._formatMoney.bind(this)) ||
      (window.Shopify?.formatMoney && ((c) => window.Shopify.formatMoney(c))) ||
      ((c) => {
        const amount = (c / 100).toFixed(2);
        return `R$ ${amount.replace('.', ',')}`;
      });

    summaryEl.textContent = safeFormat(total);
  }

  _formatMoney(cents) {
    if (window.Shopify?.formatMoney) {
      return window.Shopify.formatMoney(cents);
    }
    const amount = (cents / 100).toFixed(2);
    return `R$ ${amount.replace('.', ',')}`;
  }

  /* ── Progress ───────────────────────────────────────────── */

  _updateProgress() {
    if (!this._progressEl) return;

    const depth = this._stack.length;
    const maxDepth = Math.max(this._steps.length, depth + 2);
    const pct = Math.min(Math.round((depth / maxDepth) * 100), 100);

    if (this._progressFill) {
      this._progressFill.style.width = `${pct}%`;
    }

    if (this._progressSteps) {
      this._renderStepDots(depth);
    }
  }

  _renderStepDots(currentDepth) {
    if (!this._progressSteps) return;
    const totalDots = Math.max(this._steps.length, 3);
    let html = '';
    for (let i = 0; i < totalDots; i++) {
      let cls = 'flow-progress__step-dot';
      if (i < currentDepth) cls += ' flow-progress__step-dot--visited';
      if (i === currentDepth - 1) cls += ' flow-progress__step-dot--active';
      html += `<span class="${cls}"></span>`;
    }
    this._progressSteps.innerHTML = html;
  }

  /* ── URL state ──────────────────────────────────────────── */

  _updateURL() {
    const idx = this._getCurrentIndex();
    const step = this._steps[idx];
    if (!step) return;

    const stepId = step.dataset.stepId || idx;
    const url = new URL(window.location);
    url.searchParams.set('flow_step', stepId);
    window.history.replaceState(null, '', url);
  }

  _restoreFromURL() {
    const url = new URL(window.location);
    const stepParam = url.searchParams.get('flow_step');

    if (stepParam) {
      const idx = this._stepMap.get(stepParam);
      if (idx !== undefined) {
        this._stack.push(idx);
        this._showStep(idx, 'forward');
        return;
      }
      const numIdx = parseInt(stepParam, 10);
      if (!isNaN(numIdx) && numIdx >= 0 && numIdx < this._steps.length) {
        this._stack.push(numIdx);
        this._showStep(numIdx, 'forward');
        return;
      }
    }

    // Default: show first step
    if (this._steps.length > 0) {
      this._stack.push(0);
      this._showStep(0, 'forward');
    }
  }

  /* ── Cart drawer ────────────────────────────────────────── */

  _dispatchCartAdd() {
    document.dispatchEvent(
      new CustomEvent('cart:add', { bubbles: true })
    );

    // Theme-specific: dispatch CartAddEvent for cart-drawer auto-open
    try {
      const CartAddEvent = customElements.get('cart-drawer-component')
        ?.prototype?.constructor?.CartAddEvent;
      if (CartAddEvent) {
        document.dispatchEvent(new CartAddEvent());
      }
    } catch {
      // Fallback: try generic approach
    }
  }

  _openCartDrawer() {
    const drawer = document.querySelector('cart-drawer-component');
    if (drawer) {
      const dialog = drawer.querySelector('dialog');
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      } else if (drawer.showDialog) {
        drawer.showDialog();
      }
    }
  }

  /* ── Error display ──────────────────────────────────────── */

  _showError(msg) {
    if (this._errorEl && this._errorText) {
      this._errorText.textContent = msg;
      this._errorEl.hidden = false;
      setTimeout(() => {
        this._errorEl.hidden = true;
      }, 5000);
    }
  }

  /* ── Transition vars ────────────────────────────────────── */

  _applyTransitionVars() {
    this.style.setProperty('--flow-transition-speed', `${this._transitionSpeed}ms`);
    this.style.setProperty('--flow-transition-easing', this._transitionEasing);
  }

  /* ── Helpers ────────────────────────────────────────────── */

  _wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}

if (!customElements.get('flow-engine')) {
  customElements.define('flow-engine', FlowEngine);
}
