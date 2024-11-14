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
let gameObserver = null;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    log('Received message:', request);
    
    if (request.action === 'startHelper') {
        initHelper(request.gameCode);
    }
    
    return true;
});

function sanitizeText(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

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

        // Start both observers
        startQuestionObserver();
        startGameObserver();
        
    } catch (err) {
        error('Failed to initialize helper:', err);
        throw err;
    }
}

function startQuestionObserver() {
    log('Starting question observer');
    
    if (observer) {
        observer.disconnect();
        log('Disconnected existing question observer');
    }

    observer = new MutationObserver((mutations) => {
        log('Question DOM mutation detected');
        highlightAnswer();
    });

    // Observe the entire game container for question changes
    const gameContainer = document.querySelector('body');
    if (gameContainer) {
        observer.observe(gameContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
        
        // Initial highlight
        highlightAnswer();
    } else {
        error('Game container not found');
    }
}

function startGameObserver() {
    log('Starting game observer');
    
    if (gameObserver) {
        gameObserver.disconnect();
        log('Disconnected existing game observer');
    }

    gameObserver = new MutationObserver((mutations) => {
        log('Game DOM mutation detected');
        const questionElement = document.querySelector('[data-v-94904112]');
        if (questionElement) {
            highlightAnswer();
        }
    });

    // Observe the entire body for game state changes
    const body = document.querySelector('body');
    if (body) {
        gameObserver.observe(body, {
            childList: true,
            subtree: true
        });
    }
}

function highlightAnswer() {
    if (!quizData) {
        error('No quiz data available');
        return;
    }

    const questionElement = document.querySelector('[data-v-94904112]');
    if (!questionElement) {
        error('Question element not found');
        return;
    }

    const questionText = sanitizeText(questionElement.textContent);
    log('Current question (sanitized):', questionText);

    // Find matching question
    const questionData = quizData.questions.find(q => {
        const apiQuestionText = sanitizeText(q.structure.query.text);
        const matches = apiQuestionText === questionText;
        log('Comparing:', { 
            dom: questionText, 
            api: apiQuestionText, 
            matches 
        });
        return matches;
    });

    if (!questionData) {
        error('Question not found in data');
        log('Available questions:', quizData.questions.map(q => sanitizeText(q.structure.query.text)));
        return;
    }

    log('Found matching question data:', questionData);

    const correctAnswerIndex = questionData.structure.answer;
    const correctAnswerText = sanitizeText(questionData.structure.options[correctAnswerIndex].text);
    log('Correct answer:', correctAnswerText);

    // Try multiple possible selectors for options
    const optionSelectors = [
        '.option-content',
        '[class*="option"]',
        '[class*="answer"]',
        '[role="button"]'
    ];

    let optionElements = [];
    for (const selector of optionSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            optionElements = elements;
            log('Found options using selector:', selector);
            break;
        }
    }

    log('Found option elements:', optionElements);

    optionElements.forEach((option, index) => {
        const optionText = sanitizeText(option.textContent);
        log(`Option ${index}:`, optionText);
        
        if (optionText === correctAnswerText) {
            log('Highlighting correct answer:', option);
            
            // Remove previous highlights
            optionElements.forEach(el => {
                el.style.backgroundColor = '';
                el.style.border = '';
            });

            // Add new highlight
            option.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
            option.style.border = '2px solid #4CAF50';
        }
    });
}

// Initial setup
log('Content script loaded'); 