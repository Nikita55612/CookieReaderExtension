let cookiesHeap = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "getCookiesHeap") {
		sendResponse({ value: cookiesHeap });
	} else if (message.type === "setCookiesHeap") {
		cookiesHeap = message.value;
		sendResponse({ status: "success" });
	}
});
