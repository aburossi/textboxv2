// quiz.js - v6 (Corrected Start New Functionality)
(function() {
    'use strict';

    // --- CONSTANTS & STATE ---
    const QUIZ_ANSWERS_PREFIX = 'textbox-quizdata_';
    const QUIZ_QUESTIONS_PREFIX = 'textbox-quizquestions_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';

    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('Id');

    let state = {
        allQuestions: [],
        currentQuestionIndex: 0,
        userAnswers: {}, // Stores { q_original_index: { answer: '...', isCorrect: true/false } }
        quizMetadata: {},
        answersStorageKey: '',
        questionsStorageKey: ''
    };

    // --- DOM ELEMENTS ---
    const elements = {
        title: document.getElementById('assignment-title'),
        subTitle: document.getElementById('sub-id-title'),
        intro: document.getElementById('intro-text'),
        indicator: document.getElementById('saveIndicator'),
        quizMain: document.getElementById('quiz-main'),
        questionArea: document.getElementById('question-area'),
        feedbackArea: document.getElementById('feedback-area'),
        navigation: document.getElementById('quiz-navigation'),
        progressIndicator: document.getElementById('progress-indicator'),
        nextBtn: document.getElementById('next-btn'),
        resultsScreen: document.getElementById('results-screen'),
        resultsSummary: document.getElementById('results-summary'),
        startNewNavBtn: document.getElementById('start-new-btn-nav'),
        startNewResultsBtn: document.getElementById('start-new-btn-results'),
        header: document.getElementById('quiz-header')
    };

    // --- INITIALIZATION ---
    if (!quizId) {
        elements.title.textContent = "Fehler";
        elements.quizMain.style.display = 'block';
        elements.questionArea.innerHTML = "<p>Ein 'Id' Parameter in der URL ist erforderlich, um das Quiz zu laden (z.B. ?Id=wirtschaft).</p>";
        elements.navigation.style.display = 'none';
        return;
    }

    const quizJsonPath = `quizzes/${quizId}.json`;

    async function initializeQuiz() {
        try {
            const response = await fetch(quizJsonPath);
            if (!response.ok) throw new Error(`Netzwerk-Fehler: ${response.statusText}`);
            const data = await response.json();

            const { assignmentId, subId, questions } = data;
            if (!assignmentId || !subId || !questions) {
                throw new Error("Die JSON-Datei muss 'assignmentId', 'subId' und 'questions' enthalten.");
            }

            state.quizMetadata = data;
            state.answersStorageKey = `${QUIZ_ANSWERS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            state.questionsStorageKey = `${QUIZ_QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            
            state.allQuestions = questions.map((q, index) => ({ ...q, originalIndex: index }));

            elements.title.textContent = data.title || assignmentId.split('_').join(' ');
            elements.subTitle.textContent = subId;
             if (data.customIntroText) {
                elements.intro.innerHTML = data.customIntroText;
                elements.intro.style.display = 'block';
            }

            localStorage.setItem(state.questionsStorageKey, JSON.stringify(questions));

            setupQuiz();

        } catch (error) {
            console.error('Fehler beim Laden oder Verarbeiten des Quiz:', error);
            elements.title.textContent = "Quiz konnte nicht geladen werden";
            elements.header.style.borderBottom = 'none';
            elements.quizMain.style.display = 'block';
            elements.quizMain.innerHTML = `<p>Die Quiz-Datei unter <strong>${quizJsonPath}</strong> konnte nicht geladen werden. Fehlermeldung: ${error.message}</p>`;
            elements.navigation.style.display = 'none';
        }
    }

    // --- QUIZ SETUP AND RENDERING ---

    function setupQuiz() {
        loadAnswers();
        shuffle(state.allQuestions);
        state.currentQuestionIndex = 0;
        elements.quizMain.style.display = 'block';
        elements.navigation.style.display = 'flex';
        elements.resultsScreen.style.display = 'none';
        renderCurrentQuestion();
    }

    function renderCurrentQuestion() {
        elements.feedbackArea.innerHTML = '';
        elements.nextBtn.disabled = true;

        if (state.currentQuestionIndex >= state.allQuestions.length) {
            showResults();
            return;
        }

        const q = state.allQuestions[state.currentQuestionIndex];
        const questionId = `q${q.originalIndex}`;
        let formHtml = `<div class="question-item" id="item-${questionId}">`;
        formHtml += `<div class="question-text"><p>${q.question}</p></div>`;
        formHtml += `<form class="options-container">`;

        const options = (q.type === 'MultipleChoice') 
            ? q.options.map((opt, i) => ({ value: i, text: opt.text }))
            : [{ value: 'true', text: 'Richtig' }, { value: 'false', text: 'Falsch' }];

        options.forEach(opt => {
            formHtml += `<label><input type="radio" name="${questionId}" value="${opt.value}" required> <span>${opt.text}</span></label>`;
        });

        formHtml += `</form></div>`;
        elements.questionArea.innerHTML = formHtml;
        
        elements.questionArea.querySelector('.options-container').addEventListener('change', handleAnswerSelection);
        elements.progressIndicator.textContent = `Frage ${state.currentQuestionIndex + 1} von ${state.allQuestions.length}`;

        if (state.userAnswers[questionId]) {
            const savedAnswer = state.userAnswers[questionId].answer;
            const radio = elements.questionArea.querySelector(`input[name="${questionId}"][value="${savedAnswer}"]`);
            if (radio) {
                radio.checked = true;
                showFeedback(questionId);
                disableOptions(questionId);
                elements.nextBtn.disabled = false;
            }
        }
    }

    function showFeedback(questionId) {
        const originalIndex = parseInt(questionId.replace('q', ''));
        const questionData = state.quizMetadata.questions[originalIndex];
        const selectedRadio = elements.questionArea.querySelector(`input[name="${questionId}"]:checked`);

        if (!selectedRadio || !questionData) return;

        let isCorrect = false;
        let feedbackHtml = '';

        if (questionData.type === 'MultipleChoice') {
            const selectedOption = questionData.options[selectedRadio.value];
            isCorrect = selectedOption.is_correct;
            feedbackHtml = selectedOption.feedback;
        } else if (questionData.type === 'TrueFalse') {
            isCorrect = (selectedRadio.value === String(questionData.correct_answer));
            feedbackHtml = isCorrect ? questionData.feedback_correct : questionData.feedback_incorrect;
        }

        state.userAnswers[questionId] = { answer: selectedRadio.value, isCorrect: isCorrect };
        elements.feedbackArea.innerHTML = `<div class="feedback-container ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}">${feedbackHtml}</div>`;
    }

    // --- EVENT HANDLERS ---
    
    function handleAnswerSelection(event) {
        if (event.target.type === 'radio') {
            const questionId = event.target.name;
            showFeedback(questionId);
            saveAnswers();
            disableOptions(questionId);
            elements.nextBtn.disabled = false;
        }
    }
    
    function handleNextClick() {
        state.currentQuestionIndex++;
        renderCurrentQuestion();
    }
    
    /**
     * Handles the logic to completely reset the quiz.
     */
    function startNewQuiz() {
        const confirmed = confirm("Möchten Sie wirklich neu beginnen? Alle Ihre bisherigen Antworten für dieses Quiz werden gelöscht.");
        if (confirmed) {
            // 1. Clear stored data for this specific quiz
            localStorage.removeItem(state.answersStorageKey);

            // 2. Reset the in-memory state object for answers
            state.userAnswers = {};
            
            // 3. Inform the user and restart the quiz flow
            alert("Die gespeicherten Antworten wurden gelöscht. Das Quiz wird neu gestartet.");
            setupQuiz();
        }
    }
    
    // --- DATA & STATE MANAGEMENT ---
    function shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    function disableOptions(questionId) {
        const container = elements.questionArea.querySelector(`#item-${questionId}`);
        const radios = container.querySelectorAll(`input[name="${questionId}"]`);
        radios.forEach(radio => {
            radio.disabled = true;
            if(radio.checked) {
                radio.parentElement.classList.add('selected');
            }
        });
    }

    function saveAnswers() {
        localStorage.setItem(state.answersStorageKey, JSON.stringify({ answeredQuestions: state.userAnswers }));
        showSaveIndicator();
    }

    /**
     * Loads saved answers from local storage into the state.
     * This version is more robust against corrupted or invalid stored data.
     */
    function loadAnswers() {
        const savedData = localStorage.getItem(state.answersStorageKey);
        
        // Always start with a clean slate in memory.
        state.userAnswers = {};

        if (savedData) {
            try {
                const results = JSON.parse(savedData);
                // Only assign if the parsed data is an object and has the property we expect.
                if (results && typeof results === 'object' && results.answeredQuestions) {
                   state.userAnswers = results.answeredQuestions;
                }
            } catch (e) {
                console.error("Fehler beim Laden der Antworten. Gespeicherte Daten sind ungültig und werden ignoriert.", e);
                // state.userAnswers is already {}, so we proceed with a fresh quiz state.
            }
        }
    }
    
    function showSaveIndicator() {
        elements.indicator.style.opacity = '1';
        setTimeout(() => {
            elements.indicator.style.opacity = '0';
        }, 1500);
    }
    
    // --- QUIZ COMPLETION ---

    function showResults() {
        elements.quizMain.style.display = 'none';
        elements.navigation.style.display = 'none';
        elements.resultsScreen.style.display = 'block';

        const totalQuestions = state.allQuestions.length;
        const correctAnswers = Object.values(state.userAnswers).filter(answer => answer.isCorrect).length;
        
        elements.resultsSummary.textContent = `Du hast ${correctAnswers} von ${totalQuestions} Fragen richtig beantwortet.`;
    }

    // --- EVENT LISTENERS ---
    document.addEventListener('DOMContentLoaded', initializeQuiz);
    elements.nextBtn.addEventListener('click', handleNextClick);
    elements.startNewNavBtn.addEventListener('click', startNewQuiz);
    elements.startNewResultsBtn.addEventListener('click', startNewQuiz);

})();