/**
 * Sistema de atualização reativa de parcelamento
 * Escuta eventos de mudança de variante, carrinho e preço customizado
 * Atualiza o conteúdo do parcelamento via fetch para evitar layout shift
 */
(function() {
  'use strict';

  function InstallmentsUpdater() {
    this.init();
  }

  /**
   * Inicializa os event listeners
   */
  InstallmentsUpdater.prototype.init = function() {
    var self = this;
    
    // Escuta mudanças de variante na PDP
    document.addEventListener('variant:change', function(event) {
      self.handleVariantChange(event);
    });
    
    // Escuta mudanças no carrinho
    document.addEventListener('cart:change', function(event) {
      self.handleCartChange(event);
    });
    
    // Escuta mudanças de preço customizadas
    document.addEventListener('price:change', function(event) {
      self.handlePriceChange(event);
    });
  };

  /**
   * Atualiza parcelamento quando variante muda na PDP
   */
  InstallmentsUpdater.prototype.handleVariantChange = function(event) {
    var variant = event.detail && event.detail.variant;
    if (!variant) return;

    var installmentsElements = document.querySelectorAll('[data-installments-variant="' + variant.id + '"]');
    var self = this;
    
    installmentsElements.forEach(function(element) {
      self.updateInstallments(element, variant.price, 'pdp', variant.id);
    });
  };

  /**
   * Atualiza parcelamento quando carrinho muda
   */
  InstallmentsUpdater.prototype.handleCartChange = function(event) {
    var cart = event.detail && event.detail.cart;
    if (!cart) return;

    var cartInstallmentsElements = document.querySelectorAll('[data-installments-context="cart"]');
    var self = this;
    
    cartInstallmentsElements.forEach(function(element) {
      self.updateInstallments(element, cart.total_price, 'cart');
    });
  };

  /**
   * Atualiza parcelamento para mudanças de preço customizadas
   */
  InstallmentsUpdater.prototype.handlePriceChange = function(event) {
    var detail = event.detail || {};
    var price = detail.price;
    var context = detail.context;
    var variantId = detail.variantId;
    var element = detail.element;
    
    if (!price || !context || !element) return;

    this.updateInstallments(element, price, context, variantId);
  };

  /**
   * Atualiza o conteúdo do parcelamento via fetch
   */
  InstallmentsUpdater.prototype.updateInstallments = function(element, price, context, variantId) {
    variantId = variantId || null;
    if (!element || !price || !context) return;

    // Verifica se fetch está disponível
    if (typeof fetch === 'undefined') {
      console.warn('Fetch API não disponível para atualização de parcelamento');
      return;
    }

    try {
      // Evita layout shift mantendo altura mínima
      var originalHeight = element.offsetHeight;
      if (originalHeight > 0) {
        element.style.minHeight = originalHeight + 'px';
      }

      // Constrói parâmetros da URL
      var params = 'price=' + encodeURIComponent(price) + '&context=' + encodeURIComponent(context);
      if (variantId) {
        params += '&variant_id=' + encodeURIComponent(variantId);
      }

      // Determina a URL base
      var baseUrl = '/';
      if (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) {
        baseUrl = window.Shopify.routes.root;
      }

      // Faz requisição para snippet de parcelamento
      fetch(baseUrl + '?view=installments&' + params)
        .then(function(response) {
          if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status);
          }
          return response.text();
        })
        .then(function(html) {
          // Atualiza conteúdo sem flicker
          element.innerHTML = html;
          
          // Remove altura mínima após atualização
          setTimeout(function() {
            element.style.minHeight = '';
          }, 100);
        })
        .catch(function(error) {
          console.warn('Erro ao atualizar parcelamento:', error);
          
          // Remove altura mínima em caso de erro
          element.style.minHeight = '';
        });

    } catch (error) {
      console.warn('Erro ao atualizar parcelamento:', error);
      
      // Remove altura mínima em caso de erro
      element.style.minHeight = '';
    }
  };

  /**
   * Método público para atualização manual
   */
  InstallmentsUpdater.updateElement = function(element, price, context, variantId) {
    variantId = variantId || null;
    var updater = new InstallmentsUpdater();
    updater.updateInstallments(element, price, context, variantId);
  };

  // Inicializa automaticamente quando DOM estiver pronto
  function initInstallments() {
    new InstallmentsUpdater();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInstallments);
  } else {
    initInstallments();
  }

  // Expõe classe globalmente para uso manual
  window.InstallmentsUpdater = InstallmentsUpdater;

})();