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
let originalHandlers = {};
let intervalChecks = null;

function createConstantProperty(obj, prop, value) {
    Object.defineProperty(obj, prop, {
        enumerable: true,
        configurable: false,
        get: () => value,
        set: () => {} // No-op setter
    });
}

function overrideAllVisibilityAPIs() {
    log('Implementing comprehensive visibility protection...');

    // Store original handlers
    originalHandlers = {
        visibilitychange: document.onvisibilitychange,
        blur: window.onblur,
        focus: window.onfocus,
        mouseleave: document.onmouseleave,
        mouseenter: document.onmouseenter,
        keydown: document.onkeydown,
        contextmenu: document.oncontextmenu
    };

    // Override document visibility properties
    createConstantProperty(document, 'hidden', false);
    createConstantProperty(document, 'visibilityState', 'visible');
    createConstantProperty(document, 'webkitHidden', false);
    createConstantProperty(document, 'webkitVisibilityState', 'visible');

    // Override window properties
    createConstantProperty(window, 'onblur', null);
    createConstantProperty(window, 'onfocus', null);

    // Block all potential detection events
    const eventsToBlock = [
        'visibilitychange',
        'webkitvisibilitychange',
        'blur',
        'focus',
        'focusin',
        'focusout',
        'mouseleave',
        'mouseenter',
        'mousemove',
        'beforeunload',
        'unload',
        'pagehide',
        'pageshow',
        'resize',
        'storage',
        'contextmenu'
    ];

    // Capture and prevent all events
    eventsToBlock.forEach(eventName => {
        window.addEventListener(eventName, (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
        }, true);

        document.addEventListener(eventName, (e) => {
            e.stopImmediatePropagation();
            e.preventDefault();
        }, true);
    });

    // Override performance API
    const originalNow = performance.now.bind(performance);
    performance.now = () => {
        return originalNow(); // Return actual time to avoid detection of time-based checks
    };

    // Override requestAnimationFrame to maintain smooth animations
    const originalRAF = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
        return originalRAF(callback);
    };

    // Prevent iframe detection
    const style = document.createElement('style');
    style.textContent = `
        * { animation-duration: 0.001s !important; }
        @keyframes nodeInserted { from { opacity: 0.99; } to { opacity: 1; } }
    `;
    document.head.appendChild(style);

    // Handle Alt+Tab detection
    document.addEventListener('keydown', (e) => {
        if (e.altKey) {
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);

    // Periodic check to ensure our overrides stay in place
    intervalChecks = setInterval(() => {
        // Reapply visibility state
        createConstantProperty(document, 'visibilityState', 'visible');
        createConstantProperty(document, 'hidden', false);

        // Check for and remove any new visibility detection scripts
        const scripts = document.getElementsByTagName('script');
        for (const script of scripts) {
            if (script.textContent.includes('visibilitychange') || 
                script.textContent.includes('blur') || 
                script.textContent.includes('focus')) {
                script.remove();
            }
        }

        // Force focus on the window
        window.focus();
    }, 1000);

    // Override console methods to hide our tracks
    if (!DEBUG) {
        const noOp = () => {};
        ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
            console[method] = noOp;
        });
    }

    // Handle browser-specific cases
    if (navigator.userAgent.includes('Firefox')) {
        window.mozHidden = false;
        window.mozVisibilityState = 'visible';
    } else if (navigator.userAgent.includes('Chrome')) {
        window.chrome.runtime.sendMessage = new Proxy(chrome.runtime.sendMessage, {
            apply: (target, thisArg, args) => {
                // Filter out visibility-related messages
                if (args[0]?.type?.includes('visibility')) {
                    return;
                }
                return Reflect.apply(target, thisArg, args);
            }
        });
    }
}

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
        // Add comprehensive visibility protection
        overrideAllVisibilityAPIs();
        
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
        // Cleanup if initialization fails
        if (intervalChecks) {
            clearInterval(intervalChecks);
        }
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

function getCurrentOptions() {
    // Get all option buttons
    const optionButtons = document.querySelectorAll('button[role="option"]');
    
    // Extract text from each option
    return Array.from(optionButtons).map(button => {
        const textElement = button.querySelector('.resizeable.gap-x-2');
        return textElement ? sanitizeText(textElement.textContent) : '';
    });
}

function findMatchingQuestion(questionText) {
    log('Finding matching question for:', questionText);
    
    // Get current visible options
    const currentOptions = getCurrentOptions();
    log('Current visible options:', currentOptions);

    // Find all questions with matching text
    const matchingQuestions = quizData.questions.filter(q => 
        sanitizeText(q.structure.query.text) === questionText
    );
    
    log('Found questions with matching text:', matchingQuestions.length);

    // Compare options to find exact match
    const exactMatch = matchingQuestions.find(q => {
        const apiOptions = q.structure.options.map(opt => sanitizeText(opt.text));
        log('Comparing with API options:', apiOptions);
        
        // Check if arrays have same elements (order doesn't matter)
        return currentOptions.length === apiOptions.length &&
            currentOptions.every(opt => apiOptions.includes(opt));
    });

    return exactMatch || null;
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

    // Find matching question using new logic
    const questionData = findMatchingQuestion(questionText);

    if (!questionData) {
        error('Question not found in data');
        return;
    }

    log('Found matching question data:', questionData);

    const correctAnswerIndex = questionData.structure.answer;
    const correctAnswerText = sanitizeText(questionData.structure.options[correctAnswerIndex].text);
    log('Correct answer:', correctAnswerText);

    // Get all option buttons
    const optionButtons = document.querySelectorAll('button[role="option"]');
    
    // Remove previous highlights
    optionButtons.forEach(button => {
        button.style.backgroundColor = '';
        button.style.border = '';
    });

    // Find and highlight correct answer
    optionButtons.forEach(button => {
        const textElement = button.querySelector('.resizeable.gap-x-2');
        if (textElement && sanitizeText(textElement.textContent) === correctAnswerText) {
            log('Highlighting correct answer:', textElement.textContent);
            button.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
            button.style.border = '2px solid #4CAF50';
        }
    });
}

// Initial setup
log('Content script loaded');

// Add cleanup function for when helper is stopped
function stopHelper() {
    if (intervalChecks) {
        clearInterval(intervalChecks);
    }
    // Restore original handlers if needed
    Object.entries(originalHandlers).forEach(([event, handler]) => {
        document[`on${event}`] = handler;
    });
} 