document.addEventListener('DOMContentLoaded', function() {
  console.log("Options script loaded.");
  loadOptions(); // Load saved options when the page loads

  const saveButton = document.getElementById('save');
  if (saveButton) {
    saveButton.addEventListener('click', saveOptions);
  } else {
    console.error("Save button not found.");
  }
});

function saveOptions() {
  const apiKeyInput = document.getElementById('apiKey');
  if (apiKeyInput) {
    const apiKey = apiKeyInput.value;
    chrome.storage.sync.set({ 'apiKey': apiKey }, function() {
      console.log('API key saved.');
      // Optionally, provide user feedback (e.g., a status message)
      alert('Settings saved!');
    });
  } else {
    console.error("API key input field not found.");
  }
}

function loadOptions() {
  chrome.storage.sync.get('apiKey', function(data) {
    const apiKeyInput = document.getElementById('apiKey');
    if (apiKeyInput && data.apiKey) {
      apiKeyInput.value = data.apiKey;
      console.log('API key loaded.');
    } else {
      console.log('No API key found in storage or input field not found.');
    }
  });
}
