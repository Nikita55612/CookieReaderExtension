// Constants
const DOM_ELEMENTS = {
  status: document.getElementById('status'),
  error: document.getElementById('error'),
  getCookies: document.getElementById('getCookies'),
  copyToClipboard: document.getElementById('copyToClipboard')
};

const MESSAGES = {
  COPY_SUCCESS: 'Cookie успешно скопирован в буфер обмена!',
  EMPTY_HEAP: 'Ошибка при копировании: CookiesHeap is Empty',
  COOKIES_COUNT: (count) => `Собрано <b>${count}</b> cookies`
};

// UI Updates
const ui = {
  updateStatus: (status) => {
    DOM_ELEMENTS.status.innerHTML = status;
  },

  updateError: (error) => {
    DOM_ELEMENTS.error.innerHTML = error;
  },

  clearError: () => {
    DOM_ELEMENTS.error.innerHTML = '';
  }
};

// Chrome API Wrappers
const chromeApi = {
  async sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  },

  async getCookiesHeap() {
    const response = await this.sendMessage({ type: "getCookiesHeap" });
    if (!response?.value) {
      throw new Error("No response or value undefined");
    }
    return response.value;
  },

  async setCookiesHeap(value) {
    const response = await this.sendMessage({
      type: "setCookiesHeap",
      value
    });

    if (!response?.status === "success") {
      throw new Error("Failed to update global variable");
    }
    return "Global variable updated successfully";
  },

  async getActiveTab() {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    return tab;
  },

  async getCookiesForDomain(domain) {
    return chrome.cookies.getAll({ domain });
  }
};

// Cookie Processing
class CookieProcessor {
  static getSubdomains(url) {
    const parts = url.hostname.split('.');
    const subdomains = new Set();

    // Generate all possible subdomain combinations
    for (let i = 0; i < parts.length - 1; i++) {
      const subdomain = parts.slice(i).join('.');
      subdomains.add(subdomain);
      subdomains.add('.' + subdomain);
    }

    // Add the main domain
    if (parts.length > 1) {
      const mainDomain = parts.slice(-2).join('.');
      subdomains.add(mainDomain);
      subdomains.add('.' + mainDomain);
    }

    return Array.from(subdomains);
  }

  static cleanCookie(cookie, url) {
    const { storeId, hostOnly, expirationDate, session, ...cleanedCookie } = cookie;
    return {
      ...cleanedCookie,
      url: url.origin
    };
  }

  static async getAllCookies(url) {
    const domains = this.getSubdomains(url);
    const cookieMap = new Map();

    await Promise.all(domains.map(async (domain) => {
      const cookies = await chromeApi.getCookiesForDomain(domain);
      cookies.forEach(cookie => {
        const key = `${cookie.name}_${cookie.domain}`;
        cookieMap.set(key, this.cleanCookie(cookie, url));
      });
    }));

    return Array.from(cookieMap.values());
  }
}

// Event Handlers
const handlers = {
  async handleGetCookies() {
    try {
      const tab = await chromeApi.getActiveTab();
      const url = new URL(tab.url);

      const cookies = await CookieProcessor.getAllCookies(url);
      const cookiesHeap = await chromeApi.getCookiesHeap();
      const lengthBeforeUpdate = cookiesHeap.length;

      cookiesHeap.push(...cookies);
      const updatedHeapMap = new Map();
      cookiesHeap.forEach(cookie => {
        const key = `${cookie.name}_${cookie.domain}`;
        updatedHeapMap.set(key, cookie);
      });

      const updatedHeap = Array.from(updatedHeapMap.values());
      if (updatedHeap.length === lengthBeforeUpdate) {
        return;
      }
      await chromeApi.setCookiesHeap(updatedHeap);
      ui.clearError();
      ui.updateStatus(MESSAGES.COOKIES_COUNT(updatedHeap.length));
      createCookieAnimation(updatedHeap.length);
    } catch (error) {
      ui.updateError(`Ошибка: ${error.message}`);
    }
  },

  async handleCopyToClipboard() {
    try {
      const cookiesHeap = await chromeApi.getCookiesHeap();

      if (cookiesHeap.length === 0) {
        ui.updateError(MESSAGES.EMPTY_HEAP);
        return;
      }

      await navigator.clipboard.writeText(JSON.stringify(cookiesHeap));
      ui.clearError();
      ui.updateStatus(MESSAGES.COPY_SUCCESS);
      await chromeApi.setCookiesHeap([]);
    } catch (error) {
      ui.updateError(`Ошибка при копировании: ${error.message}`);
    }
  }
};

// Cookie Animation
function createCookieAnimation(count) {
  const cookieEmoji = '🍪';
  const minDuration = 100;
  const maxDuration = 4000;

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const cookie = document.createElement('div');
      cookie.className = 'cookie';
      cookie.textContent = cookieEmoji;

      const startX = Math.random() * (window.innerWidth - 20);
      cookie.style.left = startX + 'px';
      cookie.style.top = '-20px';

      document.body.appendChild(cookie);

      const duration = minDuration + Math.random() * (maxDuration - minDuration);

      cookie.animate([
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: `translateY(${window.innerHeight + 20}px) rotate(360deg)` }
      ], {
        duration: duration,
        easing: 'linear'
      }).onfinish = () => {
        cookie.remove();
      };
    }, Math.random() * 2000);
  }
}

// Initialize
const initialize = async () => {
  // Add event listeners
  DOM_ELEMENTS.getCookies.addEventListener('click', handlers.handleGetCookies);
  DOM_ELEMENTS.copyToClipboard.addEventListener('click', handlers.handleCopyToClipboard);

  // Set initial status
  try {
    const cookiesHeap = await chromeApi.getCookiesHeap();
    ui.updateStatus(MESSAGES.COOKIES_COUNT(cookiesHeap.length));
  } catch (error) {
    ui.updateError(`Ошибка инициализации: ${error.message}`);
  }
};

// Start the application
initialize();
