const DEBUG = true;

function log(...args) {
    if (DEBUG) {
        console.log('%c[Quizizz Helper]', 'color: #4CAF50; font-weight: bold;', ...args);
    }
}

function error(...args) {
    if (DEBUG) {
        console.error('%c[Quizizz Helper Error]', 'color: #c62828; font-weight: bold;', ...args);
    }
}

let quizData = null;
let observer = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request);
    
    if (request.action === 'startHelper') {
        initHelper(request.gameCode);
    }
    
    // Always return true for async response
    return true;
});

async function initHelper(gameCode) {
    log('Initializing helper with game code:', gameCode);
    
    try {
        // Fetch answers
        log('Fetching answers...');
        const response = await fetch('https://v3.schoolcheats.net/quizizz/answers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input: gameCode })
        });

        if (!response.ok) {
            throw new Error(`API response not ok: ${response.status}`);
        }

        quizData = await response.json();
        log('Received quiz data:', quizData);

        if (quizData.error) {
            throw new Error('API returned error: ' + JSON.stringify(quizData));
        }

        startQuestionObserver();
        
    } catch (err) {
        error('Failed to initialize helper:', err);
        throw err;
    }
}

function startQuestionObserver() {
    log('Starting question observer');
    
    // Cleanup existing observer
    if (observer) {
        observer.disconnect();
        log('Disconnected existing observer');
    }

    observer = new MutationObserver((mutations) => {
        log('DOM mutation detected:', mutations);
        highlightAnswer();
    });

    // Find question container
    const questionContainer = document.querySelector('[data-v-94904112]');
    if (questionContainer) {
        log('Found question container:', questionContainer);
        observer.observe(questionContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Initial highlight
        highlightAnswer();
    } else {
        error('Question container not found');
    }
}

function highlightAnswer() {
    if (!quizData) {
        error('No quiz data available');
        return;
    }

    // Get current question
    const questionElement = document.querySelector('[data-v-94904112]');
    if (!questionElement) {
        error('Question element not found');
        return;
    }

    const questionText = questionElement.textContent.trim();
    log('Current question:', questionText);

    // Find matching question
    const questionData = quizData.questions.find(q => 
        q.structure.query.text.trim() === questionText
    );

    if (!questionData) {
        error('Question not found in data');
        return;
    }

    log('Found matching question data:', questionData);

    const correctAnswerIndex = questionData.structure.answer;
    const correctAnswerText = questionData.structure.options[correctAnswerIndex].text;
    log('Correct answer:', correctAnswerText);

    // Find all option elements
    const optionElements = document.querySelectorAll('.option-content, [class*="option"]');
    log('Found option elements:', optionElements);

    optionElements.forEach((option, index) => {
        const optionText = option.textContent.trim();
        log(`Option ${index}:`, optionText);
        
        if (optionText === correctAnswerText) {
            log('Highlighting correct answer:', option);
            option.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
            option.style.border = '2px solid #4CAF50';
        }
    });
}

// Initial setup
log('Content script loaded'); 