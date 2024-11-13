const button = document.getElementById('startHelper');
const status = document.getElementById('status');

function updateStatus(message, isError = false) {
    status.textContent = message;
    status.className = isError ? 'error' : 'success';
}

button.addEventListener('click', async () => {
    const gameCode = document.getElementById('gameCode').value;
    
    if (!gameCode) {
        updateStatus('Please enter a game code', true);
        return;
    }

    button.disabled = true;
    updateStatus('Starting helper...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }

        await chrome.tabs.sendMessage(tab.id, {
            action: 'startHelper',
            gameCode: gameCode
        });

        updateStatus('Helper started successfully! Answers will be highlighted.');
    } catch (error) {
        console.error('Popup error:', error);
        updateStatus(`Error: ${error.message}`, true);
    } finally {
        button.disabled = false;
    }
});

// Check if we're on Quizizz
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.url?.includes('quizizz.com')) {
        updateStatus('Please open a Quizizz game first!', true);
        button.disabled = true;
    }
}); 