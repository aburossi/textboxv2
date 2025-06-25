// quiz.js - v3 (Simplified URL Loading)
(function() {
    'use strict';

    const QUIZ_ANSWERS_PREFIX = 'textbox-quizdata_';
    const QUIZ_QUESTIONS_PREFIX = 'textbox-quizquestions_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';

    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('Id');

    const elements = {
        title: document.getElementById('assignment-title'),
        subTitle: document.getElementById('sub-id-title'),
        intro: document.getElementById('intro-text'),
        form: document.getElementById('quiz-form'),
        indicator: document.getElementById('saveIndicator')
    };

    if (!quizId) {
        elements.title.textContent = "Fehler";
        elements.form.innerHTML = "<p>Ein 'Id' Parameter in der URL ist erforderlich, um das Quiz zu laden (z.B. ?Id=wirtschaft).</p>";
        return;
    }

    const quizJsonPath = `quizzes/${quizId}.json`;

    async function loadAndRenderQuiz() {
        try {
            const response = await fetch(quizJsonPath);
            if (!response.ok) throw new Error(`Netzwerk-Fehler: ${response.statusText}`);
            const data = await response.json();
            
            // *** CRITICAL: Get metadata FROM the JSON file ***
            const { assignmentId, subId } = data;
            if (!assignmentId || !subId) {
                throw new Error("Die JSON-Datei muss 'assignmentId' and 'subId' enthalten.");
            }

            // Set titles and render the quiz
            elements.title.textContent = data.title || assignmentId.split('_').join(' ');
            elements.subTitle.textContent = subId;
            renderQuiz(data);

            // Now that we have the IDs, define storage keys
            const answersStorageKey = `${QUIZ_ANSWERS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            const questionsStorageKey = `${QUIZ_QUESTIONS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
            
            // Save questions and load answers
            localStorage.setItem(questionsStorageKey, JSON.stringify(data.questions));
            loadAnswers(answersStorageKey, data.questions);

        } catch (error) {
            console.error('Fehler beim Laden oder Verarbeiten des Quiz:', error);
            elements.title.textContent = "Quiz konnte nicht geladen werden";
            elements.form.innerHTML = `<p>Die Quiz-Datei unter <strong>${quizJsonPath}</strong> konnte nicht geladen werden. Fehlermeldung: ${error.message}</p>`;
        }
    }
    
    function renderQuiz(data) {
        // This function remains the same as before
        if (data.customIntroText) {
            elements.intro.innerHTML = data.customIntroText;
            elements.intro.style.display = 'block';
        }
        
        let formHtml = '';
        data.questions.forEach((q, index) => {
            const questionId = `q${index}`;
            formHtml += `<div class="question-item" id="item-${questionId}">`;
            formHtml += `<div class="question-text">${q.question}</div>`;
            formHtml += `<div class="options-container">`;

            if (q.type === 'MultipleChoice') {
                q.options.forEach((opt, optIndex) => {
                    formHtml += `<label><input type="radio" name="${questionId}" value="${optIndex}" required> ${opt.text}</label>`;
                });
            } else if (q.type === 'TrueFalse') {
                formHtml += `<label><input type="radio" name="${questionId}" value="true" required> Richtig</label>`;
                formHtml += `<label><input type="radio" name="${questionId}" value="false" required> Falsch</label>`;
            }
            formHtml += `</div><div id="feedback-${questionId}" class="feedback-container"></div></div>`;
        });
        elements.form.innerHTML = formHtml;
    }
    
    function saveAnswers(storageKey) {
        // This function is simplified, it just needs the key
        const formData = new FormData(elements.form);
        const results = { answeredQuestions: {} };

        for (const [questionId, answerValue] of formData.entries()) {
            results.answeredQuestions[questionId] = { answer: answerValue };
        }
        
        localStorage.setItem(storageKey, JSON.stringify(results));
        showSaveIndicator();
    }

    function loadAnswers(storageKey, questions) {
        // This function now receives the storage key directly
        const savedData = localStorage.getItem(storageKey);
        if (savedData) {
            try {
                const results = JSON.parse(savedData);
                for (const [questionId, data] of Object.entries(results.answeredQuestions)) {
                    const radio = elements.form.querySelector(`input[name="${questionId}"][value="${data.answer}"]`);
                    if (radio) {
                        radio.checked = true;
                        showFeedback(questionId, questions);
                    }
                }
            } catch (e) { console.error("Fehler beim Laden der Antworten:", e); }
        }
    }

    function showFeedback(questionId, questions) {
        // This function remains the same as before
        const questionIndex = parseInt(questionId.replace('q', ''));
        const questionData = questions[questionIndex];
        const feedbackEl = document.getElementById(`feedback-${questionId}`);
        const selectedRadio = elements.form.querySelector(`input[name="${questionId}"]:checked`);
        
        if (!selectedRadio || !feedbackEl) return;

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

        feedbackEl.innerHTML = feedbackHtml;
        feedbackEl.className = `feedback-container ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
        feedbackEl.style.display = 'block';
    }

    function showSaveIndicator() {
        // This function remains the same as before
        elements.indicator.style.opacity = '1';
        elements.indicator.style.transform = 'translateY(0)';
        setTimeout(() => {
            elements.indicator.style.opacity = '0';
            elements.indicator.style.transform = 'translateY(100px)';
        }, 1500);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadAndRenderQuiz().then(() => {
            // Add event listener after the quiz is loaded
            elements.form.addEventListener('change', (event) => {
                if (event.target.type === 'radio') {
                    // Re-fetch data to get metadata for saving and feedback
                    fetch(quizJsonPath).then(res => res.json()).then(data => {
                        const { assignmentId, subId } = data;
                        const answersStorageKey = `${QUIZ_ANSWERS_PREFIX}${assignmentId}_${SUB_STORAGE_PREFIX}${subId}`;
                        saveAnswers(answersStorageKey);
                        showFeedback(event.target.name, data.questions);
                    });
                }
            });
        });
    });
})();