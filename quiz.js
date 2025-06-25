// quiz.js
(function() {
    'use strict';

    const QUIZ_STORAGE_PREFIX = 'textbox-quizdata_';
    const params = new URLSearchParams(window.location.search);
    const quizJsonPath = params.get('quiz');
    const assignmentId = params.get('assignmentId');
    const subId = params.get('subIds');

    const elements = {
        title: document.getElementById('quiz-title'),
        intro: document.getElementById('intro-text'),
        form: document.getElementById('quiz-form'),
        indicator: document.getElementById('saveIndicator')
    };

    if (!quizJsonPath || !assignmentId || !subId) {
        elements.title.textContent = "Fehler";
        elements.form.innerHTML = "<p>Wichtige URL-Parameter fehlen (quiz, assignmentId, subIds). Das Quiz kann nicht geladen werden.</p>";
        return;
    }

    const storageKey = `${QUIZ_STORAGE_PREFIX}${assignmentId}_${subId}`;

    async function loadAndRenderQuiz() {
        try {
            const response = await fetch(quizJsonPath);
            if (!response.ok) throw new Error(`Netzwerk-Fehler: ${response.statusText}`);
            const data = await response.json();
            
            renderQuiz(data);
            loadAnswers(data.questions);

        } catch (error) {
            console.error('Fehler beim Laden oder Verarbeiten des Quiz:', error);
            elements.title.textContent = "Quiz konnte nicht geladen werden";
            elements.form.innerHTML = `<p>Die Quiz-Datei unter <strong>${quizJsonPath}</strong> konnte nicht geladen oder verarbeitet werden. Bitte prüfen Sie den Pfad und das JSON-Format.</p>`;
        }
    }

    function renderQuiz(data) {
        elements.title.textContent = data.title;
        elements.intro.innerHTML = data.customIntroText || '';
        
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
    
    function saveAnswers(questions) {
        const formData = new FormData(elements.form);
        const results = {
            answeredQuestions: {}
        };

        for (const [questionId, answerIndex] of formData.entries()) {
            const questionIndex = parseInt(questionId.replace('q', ''));
            const question = questions[questionIndex];
            
            results.answeredQuestions[questionId] = {
                question: question.question,
                type: question.type,
                answer: answerIndex
            };
        }
        
        localStorage.setItem(storageKey, JSON.stringify(results));
        showSaveIndicator();
    }

    function loadAnswers(questions) {
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
            } catch (e) {
                console.error("Fehler beim Laden der Antworten:", e);
            }
        }
    }

    function showSaveIndicator() {
        elements.indicator.style.opacity = '1';
        elements.indicator.style.transform = 'translateY(0)';
        setTimeout(() => {
            elements.indicator.style.opacity = '0';
            elements.indicator.style.transform = 'translateY(100px)';
        }, 1500);
    }

    function showFeedback(questionId, questions) {
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

    document.addEventListener('DOMContentLoaded', () => {
        loadAndRenderQuiz().then(() => {
            elements.form.addEventListener('change', (event) => {
                if (event.target.type === 'radio') {
                    // Lazy-load questions data for saving, as it's already rendered
                    fetch(quizJsonPath).then(res => res.json()).then(data => {
                        saveAnswers(data.questions);
                        showFeedback(event.target.name, data.questions);
                    });
                }
            });
        });
    });

})();