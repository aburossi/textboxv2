// quiz-script.js
(function() {
    'use strict';

    // --- CONFIGURATION ---
    // Use a unique prefix to avoid conflicts with the textbox data
    const TF_QUIZ_PREFIX = 'textbox-tfquiz_'; 
    const SUB_STORAGE_PREFIX = 'textbox-sub_';

    // --- DOM Elements ---
    const quizForm = document.getElementById('quiz-form');
    const assignmentTitleEl = document.getElementById('assignment-title');
    const saveIndicator = document.getElementById('saveIndicator');

    // --- HELPER FUNCTIONS ---
    const getQueryParams = () => new URLSearchParams(window.location.search);
    const parseMarkdown = (text) => {
        if (!text) return '';
        text = text.replace(/(\*\*|__)(?=\S)(.*?)(?<=\S)\1/g, '<strong>$2</strong>');
        text = text.replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '<em>$2</em>');
        return text;
    };
    function showSaveIndicator() {
        if (!saveIndicator) return;
        saveIndicator.style.opacity = '1';
        setTimeout(() => { saveIndicator.style.opacity = '0'; }, 1500);
    }

    // --- CORE LOGIC ---

    /**
     * Saves the current state of the quiz to localStorage.
     */
    function saveAnswers() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        
        if (!assignmentId || !subId || !quizForm) return;

        const formData = new FormData(quizForm);
        const answers = {};
        for (const [key, value] of formData.entries()) {
            answers[key] = value;
        }

        const storageKey = `${TF_QUIZ_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        localStorage.setItem(storageKey, JSON.stringify(answers));
        showSaveIndicator();
    }

    /**
     * Loads saved answers from localStorage and populates the form.
     */
    function loadAnswers() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        
        if (!assignmentId || !subId) return;

        const storageKey = `${TF_QUIZ_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
        const savedData = localStorage.getItem(storageKey);

        if (savedData) {
            try {
                const answers = JSON.parse(savedData);
                for (const [questionKey, answerValue] of Object.entries(answers)) {
                    const radio = quizForm.querySelector(`input[name="${questionKey}"][value="${answerValue}"]`);
                    if (radio) {
                        radio.checked = true;
                    }
                }
            } catch (e) {
                console.error("Error parsing saved quiz data:", e);
            }
        }
    }

    /**
     * Renders the quiz based on URL parameters.
     */
    function renderQuiz() {
        const params = getQueryParams();
        const assignmentId = params.get('assignmentId');
        const subId = params.get('subIds');
        
        assignmentTitleEl.textContent = subId || "Quiz"; // Use subId as the title

        const questions = [];
        params.forEach((value, key) => {
            if (key.startsWith('question')) {
                questions.push({ key, text: value });
            }
        });

        // Sort questions numerically (question1, question2, etc.)
        questions.sort((a, b) => {
            const numA = parseInt(a.key.replace('question', ''), 10);
            const numB = parseInt(b.key.replace('question', ''), 10);
            return numA - numB;
        });

        if (questions.length === 0) {
            quizForm.innerHTML = '<p>Keine Fragen in der URL gefunden.</p>';
            return;
        }

        let quizHtml = '';
        questions.forEach((q, index) => {
            const questionKey = q.key;
            quizHtml += `
                <div class="quiz-item">
                    <p>${index + 1}. ${parseMarkdown(q.text)}</p>
                    <div class="options">
                        <label>
                            <input type="radio" name="${questionKey}" value="true" required> Richtig
                        </label>
                        <label>
                            <input type="radio" name="${questionKey}" value="false"> Falsch
                        </label>
                    </div>
                </div>
            `;
        });
        
        quizForm.innerHTML = quizHtml;
    }

    // --- INITIALIZATION ---
    document.addEventListener("DOMContentLoaded", function() {
        renderQuiz();
        loadAnswers();

        // Add a single event listener to the form to handle changes efficiently
        quizForm.addEventListener('change', saveAnswers);
    });

})();