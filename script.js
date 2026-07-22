/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

/* Use your class Cloudflare Worker URL here (no API key in frontend code) */
const WORKER_URL = "https://wonderbot-worker.kentwilkison.workers.dev/";

/* Save selected IDs so choices persist after page refresh */
const SELECTED_STORAGE_KEY = "loreal-selected-product-ids";

/* Cache products to avoid repeated network calls */
let allProducts = [];

/* Use a Set for quick add/remove checks */
const selectedProductIds = new Set(loadSavedSelectionIds());

/* Store chat history for follow-up questions */
let conversationMessages = [];

/* Keeps track of whether a routine has been generated */
let hasGeneratedRoutine = false;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

chatWindow.innerHTML = `
  <div class="placeholder-message">
    Select products, generate a routine, then ask follow-up questions.
  </div>
`;

renderSelectedProducts();
updateGenerateButtonState();

/* Load products once when page starts */
initializeApp();

/* Handle category changes */
categoryFilter.addEventListener("change", handleCategoryChange);

/* Let users clear all saved selections */
clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelectedIds();
  renderSelectedProducts();
  refreshVisibleCardSelectionStyles();
  updateGenerateButtonState();
});

/* Generate a routine from selected products */
generateRoutineBtn.addEventListener("click", generateRoutineFromSelection);

/* Handle follow-up questions in chat */
chatForm.addEventListener("submit", handleChatSubmit);

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Initial app setup */
async function initializeApp() {
  allProducts = await loadProducts();
  renderSelectedProducts();
  updateGenerateButtonState();
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article class="product-card ${
      selectedProductIds.has(product.id) ? "selected" : ""
    }" data-product-id="${product.id}">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <p class="product-category">${product.category}</p>
        <button
          type="button"
          class="toggle-description-btn"
          data-description-toggle="${product.id}"
          aria-expanded="false"
          aria-controls="description-${product.id}"
        >
          Show details
        </button>
        <p id="description-${product.id}" class="product-description" hidden>
          ${product.description}
        </p>
      </div>
    </article>
  `,
    )
    .join("");

  /* Attach behavior to newly rendered cards */
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const productId = Number(card.dataset.productId);
      toggleProductSelection(productId);
      card.classList.toggle("selected", selectedProductIds.has(productId));
      updateGenerateButtonState();
    });
  });

  /* Description buttons should not trigger card selection */
  const descriptionButtons = productsContainer.querySelectorAll(
    ".toggle-description-btn",
  );

  descriptionButtons.forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();

      const descriptionId = button.getAttribute("aria-controls");
      const descriptionEl = document.getElementById(descriptionId);
      const isExpanded = button.getAttribute("aria-expanded") === "true";

      button.setAttribute("aria-expanded", String(!isExpanded));
      button.textContent = isExpanded ? "Show details" : "Hide details";
      descriptionEl.hidden = isExpanded;
    });
  });
}

/* Toggle selected state of a product */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }

  saveSelectedIds();
  renderSelectedProducts();
}

/* Draw the selected product list and add remove buttons */
function renderSelectedProducts() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="empty-selected-message">No products selected yet.</p>
    `;
    clearSelectionsBtn.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
      <div class="selected-item" data-selected-id="${product.id}">
        <div class="selected-item-text">
          <strong>${product.name}</strong>
          <span>${product.brand}</span>
        </div>
        <button
          type="button"
          class="remove-selected-btn"
          data-remove-id="${product.id}"
          aria-label="Remove ${product.name}"
        >
          Remove
        </button>
      </div>
    `,
    )
    .join("");

  clearSelectionsBtn.disabled = false;

  const removeButtons = selectedProductsList.querySelectorAll(
    ".remove-selected-btn",
  );

  removeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.removeId);
      selectedProductIds.delete(productId);
      saveSelectedIds();
      renderSelectedProducts();
      refreshVisibleCardSelectionStyles();
      updateGenerateButtonState();
    });
  });
}

/* Keep visible cards in sync after list-side removals */
function refreshVisibleCardSelectionStyles() {
  const cards = productsContainer.querySelectorAll(".product-card");
  cards.forEach((card) => {
    const productId = Number(card.dataset.productId);
    card.classList.toggle("selected", selectedProductIds.has(productId));
  });
}

/* Read selected products as full objects */
function getSelectedProducts() {
  if (allProducts.length === 0) {
    return [];
  }

  return allProducts.filter((product) => selectedProductIds.has(product.id));
}

/* Save only IDs in localStorage */
function saveSelectedIds() {
  localStorage.setItem(
    SELECTED_STORAGE_KEY,
    JSON.stringify(Array.from(selectedProductIds)),
  );
}

/* Load saved IDs from localStorage */
function loadSavedSelectionIds() {
  const rawValue = localStorage.getItem(SELECTED_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((id) => Number(id)).filter((id) => !Number.isNaN(id));
  } catch {
    return [];
  }
}

/* Enable/disable routine button when needed */
function updateGenerateButtonState() {
  generateRoutineBtn.disabled = selectedProductIds.size === 0;
}

/* Filter and display products when category changes */
async function handleCategoryChange(event) {
  const selectedCategory = event.target.value;

  const filteredProducts = allProducts.filter(
    (product) => product.category === selectedCategory,
  );

  displayProducts(filteredProducts);
}

/* Build routine by sending selected products to Worker */
async function generateRoutineFromSelection() {
  const selectedProducts = getSelectedProducts();

  if (selectedProducts.length === 0) {
    appendMessage("assistant", "Please select at least one product first.");
    return;
  }

  if (WORKER_URL.includes("your-subdomain")) {
    appendMessage(
      "assistant",
      "Please set your deployed Cloudflare Worker URL in script.js before generating a routine.",
    );
    return;
  }

  const productsForPrompt = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));

  /* Start fresh routine context based on current selected products */
  conversationMessages = [
    {
      role: "system",
      content:
        "You are a helpful L'Oréal skincare, haircare, makeup, and fragrance advisor. Use only the user's selected products to build a practical routine. For follow-up questions, stay within routine guidance and related beauty topics. If asked unrelated topics, politely redirect to routine or beauty care.",
    },
    {
      role: "user",
      content: `Create a personalized routine using only these selected products: ${JSON.stringify(
        productsForPrompt,
      )}. Include simple steps, time of day, and short safety notes where relevant.`,
    },
  ];

  appendMessage(
    "user",
    "Generate my personalized routine from selected products.",
  );

  const wasSuccessful = await sendConversationToWorker();
  hasGeneratedRoutine = wasSuccessful;
}

/* Send follow-up questions after routine is generated */
async function handleChatSubmit(event) {
  event.preventDefault();

  const messageText = userInput.value.trim();
  if (!messageText) {
    return;
  }

  if (!hasGeneratedRoutine) {
    appendMessage(
      "assistant",
      "Generate a routine first, then I can answer follow-up questions about it.",
    );
    userInput.value = "";
    return;
  }

  if (WORKER_URL.includes("your-subdomain")) {
    appendMessage(
      "assistant",
      "Please set your deployed Cloudflare Worker URL in script.js before using chat.",
    );
    userInput.value = "";
    return;
  }

  conversationMessages.push({
    role: "user",
    content: messageText,
  });

  appendMessage("user", messageText);
  userInput.value = "";

  await sendConversationToWorker();
}

/* Shared helper for API calls so routine + follow-up use same history */
async function sendConversationToWorker() {
  try {
    const response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: conversationMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Worker request failed with status ${response.status}`);
    }

    const data = await response.json();
    const assistantReply = data?.choices?.[0]?.message?.content;

    if (!assistantReply) {
      throw new Error("Worker response did not include assistant content.");
    }

    conversationMessages.push({
      role: "assistant",
      content: assistantReply,
    });

    appendMessage("assistant", assistantReply);
    return true;
  } catch (error) {
    /* Remove the last user message if the request fails to keep history clean */
    const lastMessage = conversationMessages[conversationMessages.length - 1];
    if (lastMessage && lastMessage.role === "user") {
      conversationMessages.pop();
    }

    appendMessage(
      "assistant",
      `Sorry, I could not reach the routine service. ${error.message}`,
    );
    return false;
  }
}

/* Render a chat message bubble */
function appendMessage(role, text) {
  if (chatWindow.querySelector(".placeholder-message")) {
    chatWindow.innerHTML = "";
  }

  const message = document.createElement("div");
  message.className = `chat-message ${role}`;
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
