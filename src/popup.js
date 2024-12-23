// Types and Constants
const UIElements = {
    STATUS: 'status',
    ERROR: 'error',
    GET_COOKIES: 'getCookies',
    COPY_TO_CLIPBOARD: 'copyToClipboard'
};

const Messages = {
    SUCCESS: {
        COPY: 'Cookie успешно скопирован в буфер обмена!',
        COOKIES_COUNT: (count) => `Собрано <b>${count}</b> cookies`
    },
    ERROR: {
        EMPTY_HEAP: 'Ошибка при копировании: CookiesHeap is Empty',
        NO_RESPONSE: 'No response or value undefined',
        UPDATE_FAILED: 'Failed to update global variable',
        INIT_ERROR: (message) => `Ошибка инициализации: ${message}`
    }
};

// UI Manager
class UIManager {
    constructor() {
        this.elements = this.initializeElements();
    }

    // Initializes references to DOM elements
    initializeElements() {
        return Object.fromEntries(
            Object.entries(UIElements).map(([key, id]) => [
                key,
                document.getElementById(id)
            ])
        );
    }

    // Updates the status text in the UI
    updateStatus(status) {
        this.elements.STATUS.innerHTML = status;
    }

    // Displays an error message
    updateError(error) {
        this.elements.ERROR.innerHTML = error;
    }

    // Clears any error message in the UI
    clearError() {
        this.elements.ERROR.innerHTML = '';
    }

    // Animates cookies falling from the top of the screen
    createCookieAnimation(count) {
        const CONFIG = {
            EMOJI: '🍪',
            MAX_DURATION: 3600,
            MIN_DURATION: 200,
            DELAY_RANGE: 1000,
            SIZE: 20
        };

        Array.from({ length: count }).forEach(() => {
            setTimeout(() => {
                const cookie = document.createElement('div');
                cookie.className = 'cookie';
                cookie.textContent = CONFIG.EMOJI;

                const startX = Math.random() * (window.innerWidth - CONFIG.SIZE);
                cookie.style.left = `${startX}px`;
                cookie.style.top = '-20px';

                document.body.appendChild(cookie);

                const duration = CONFIG.MIN_DURATION + Math.random() * (CONFIG.MAX_DURATION - CONFIG.MIN_DURATION);

                cookie.animate([
                    { transform: 'translateY(0) rotate(0deg)' },
                    { transform: `translateY(${window.innerHeight + CONFIG.SIZE}px) rotate(360deg)` }
                ], {
                    duration,
                    easing: 'linear'
                }).onfinish = () => cookie.remove();
            }, Math.random() * CONFIG.DELAY_RANGE);
        });
    }
}

// Chrome API Service
class ChromeAPIService {
    // Sends a message to the Chrome extension
    async sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                }
                resolve(response);
            });
        });
    }

    // Retrieves the cookies heap
    async getCookiesHeap() {
        const response = await this.sendMessage({ type: "getCookiesHeap" });
        if (!response?.value) {
            throw new Error(Messages.ERROR.NO_RESPONSE);
        }
        return response.value;
    }

    // Updates the cookies heap
    async setCookiesHeap(value) {
        const response = await this.sendMessage({
            type: "setCookiesHeap",
            value
        });

        if (!response?.status === "success") {
            throw new Error(Messages.ERROR.UPDATE_FAILED);
        }
        return true;
    }

    // Gets the active tab information
    async getActiveTab() {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });
        return tab;
    }

    // Fetches all cookies for a specific domain
    async getCookiesForDomain(domain) {
        return chrome.cookies.getAll({ domain });
    }
}

// Cookie Manager
class CookieManager {
    constructor(uiManager, chromeService) {
        this.ui = uiManager;
        this.chrome = chromeService;
        this.bindEventListeners();
    }

    // Binds event listeners to UI elements
    bindEventListeners() {
        this.ui.elements.GET_COOKIES.addEventListener('click', () => this.handleGetCookies());
        this.ui.elements.COPY_TO_CLIPBOARD.addEventListener('click', () => this.handleCopyToClipboard());
    }

    // Extracts all possible subdomains from a URL
    static getSubdomains(url) {
        const parts = url.hostname.split('.');
        const subdomains = new Set();

        for (let i = 0; i < parts.length - 1; i++) {
            const subdomain = parts.slice(i).join('.');
            subdomains.add(subdomain);
            subdomains.add('.' + subdomain);
        }

        if (parts.length > 1) {
            const mainDomain = parts.slice(-2).join('.');
            subdomains.add(mainDomain);
            subdomains.add('.' + mainDomain);
        }

        return Array.from(subdomains);
    }

    // Cleans a cookie object by removing unnecessary properties
    static cleanCookie(cookie, url) {
        const { storeId, hostOnly, expirationDate, session, ...cleanedCookie } = cookie;
        return {
            ...cleanedCookie,
            url: url.origin
        };
    }

    // Retrieves all cookies for a given URL across subdomains
    async getAllCookies(url) {
        const domains = CookieManager.getSubdomains(url);
        const cookieMap = new Map();

        await Promise.all(domains.map(async (domain) => {
            const cookies = await this.chrome.getCookiesForDomain(domain);
            cookies.forEach(cookie => {
                const key = `${cookie.name}_${cookie.domain}`;
                cookieMap.set(key, CookieManager.cleanCookie(cookie, url));
            });
        }));

        return Array.from(cookieMap.values());
    }

    // Converts camelCase keys to snake_case in an object or array
    static camelToSnake(obj) {
        if (typeof obj !== 'object' || obj === null) return obj;
        if (Array.isArray(obj)) return obj.map(CookieManager.camelToSnake);

        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [
                key.replace(/([A-Z])/g, '_$1').replace(/^_/, '').toLowerCase(),
                CookieManager.camelToSnake(value)
            ])
        );
    }

    // Handles fetching and processing cookies
    async handleGetCookies() {
        try {
            const tab = await this.chrome.getActiveTab();
            const url = new URL(tab.url);
            const cookies = await this.getAllCookies(url);
            const cookiesHeap = await this.chrome.getCookiesHeap();

            const updatedHeap = this.mergeAndDedupeCookies(cookiesHeap, cookies);

            if (updatedHeap.length > cookiesHeap.length) {
                await this.chrome.setCookiesHeap(updatedHeap);
                this.ui.clearError();
                this.ui.updateStatus(Messages.SUCCESS.COOKIES_COUNT(updatedHeap.length));
                this.ui.createCookieAnimation(updatedHeap.length);
            }
        } catch (error) {
            this.ui.updateError(`Ошибка: ${error.message}`);
        }
    }

    // Merges and deduplicates cookies
    mergeAndDedupeCookies(existingCookies, newCookies) {
        const cookieMap = new Map();
        [...existingCookies, ...newCookies].forEach(cookie => {
            const key = `${cookie.name}_${cookie.domain}`;
            cookieMap.set(key, cookie);
        });
        return Array.from(cookieMap.values());
    }

    // Handles copying cookies to clipboard
    async handleCopyToClipboard() {
        try {
            const cookiesHeap = await this.chrome.getCookiesHeap();
            if (cookiesHeap.length === 0) {
                this.ui.updateError(Messages.ERROR.EMPTY_HEAP);
                return;
            }

            const snakeCookiesHeap = CookieManager.camelToSnake(cookiesHeap);
            await navigator.clipboard.writeText(JSON.stringify(snakeCookiesHeap));
            this.ui.clearError();
            this.ui.updateStatus(Messages.SUCCESS.COPY);
            await this.chrome.setCookiesHeap([]);
        } catch (error) {
            this.ui.updateError(`Ошибка при копировании: ${error.message}`);
        }
    }

    // Initializes the application
    async initialize() {
        try {
            const cookiesHeap = await this.chrome.getCookiesHeap();
            this.ui.updateStatus(Messages.SUCCESS.COOKIES_COUNT(cookiesHeap.length));
        } catch (error) {
            this.ui.updateError(Messages.ERROR.INIT_ERROR(error.message));
        }
    }
}

// Application initialization
const app = new CookieManager(
    new UIManager(),
    new ChromeAPIService()
);

app.initialize();
