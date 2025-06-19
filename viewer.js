// viewer.js
(function() {
    'use strict';

    // --- CONFIGURATION ---
    const STORAGE_PREFIX = 'textbox-assignment_';
    const SUB_STORAGE_PREFIX = 'textbox-sub_';
    const QUESTIONS_PREFIX = 'textbox-questions_';
    const DB_NAME = 'allgemeinbildungDB';
    const ATTACHMENT_STORE = 'attachments';

    // --- DOM ELEMENTS ---
    const dataContainer = document.getElementById('data-container');
    const reloadDataBtn = document.getElementById('reloadDataBtn');
    const clearAllDataBtn = document.getElementById('clearAllDataBtn');

    let db; // Global state for the IndexedDB connection

    // --- DATABASE LOGIC ---
    function initializeDB(callback) {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = function(event) {
            const dbInstance = event.target.result;
            if (!dbInstance.objectStoreNames.contains(ATTACHMENT_STORE)) {
                const attachmentStore = dbInstance.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id', autoIncrement: true });
                attachmentStore.createIndex('assignment_sub_idx', ['assignmentId', 'subId'], { unique: false });
            }
        };

        request.onsuccess = function(event) {
            db = event.target.result;
            console.log("Database initialized successfully for viewer.");
            if (callback) callback();
        };

        request.onerror = function(event) {
            console.error("IndexedDB error:", event.target.errorCode);
            dataContainer.innerHTML = `<p class="error-message">Fehler beim Zugriff auf die Datenbank. Anhänge können nicht geladen werden.</p>`;
        };
    }

    function getAllAttachments(callback) {
        if (!db) return callback([]);
        const transaction = db.transaction([ATTACHMENT_STORE], 'readonly');
        const store = transaction.objectStore(ATTACHMENT_STORE);
        const request = store.getAll();

        request.onsuccess = () => callback(request.result || []);
        request.onerror = (e) => {
            console.error('Error fetching all attachments:', e.target.error);
            callback([]);
        };
    }

    // --- DATA GATHERING & PROCESSING ---
    function loadAndDisplayData() {
        dataContainer.innerHTML = `<p class="loading-message">Lade Daten...</p>`;

        initializeDB(() => {
            getAllAttachments(attachments => {
                const dataStore = processAllData(attachments);
                renderData(dataStore);
            });
        });
    }

    function processAllData(attachments) {
        const dataStore = {};

        // 1. Process answers and questions from localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            let isAnswerKey = key.startsWith(STORAGE_PREFIX);
            let isQuestionKey = key.startsWith(QUESTIONS_PREFIX);

            if (isAnswerKey || isQuestionKey) {
                const prefix = isAnswerKey ? STORAGE_PREFIX : QUESTIONS_PREFIX;
                const keyParts = key.substring(prefix.length).split(`_${SUB_STORAGE_PREFIX}`);
                if (keyParts.length !== 2) continue;

                const assignmentId = keyParts[0];
                const subId = keyParts[1];

                // Ensure nested structure exists
                if (!dataStore[assignmentId]) dataStore[assignmentId] = {};
                if (!dataStore[assignmentId][subId]) dataStore[assignmentId][subId] = { answer: '', questions: {}, attachments: [] };

                if (isAnswerKey) {
                    dataStore[assignmentId][subId].answer = localStorage.getItem(key);
                } else if (isQuestionKey) {
                    try {
                        dataStore[assignmentId][subId].questions = JSON.parse(localStorage.getItem(key));
                    } catch (e) {
                        console.error(`Error parsing questions for ${key}:`, e);
                    }
                }
            }
        }

        // 2. Distribute attachments into the dataStore
        attachments.forEach(att => {
            if (dataStore[att.assignmentId] && dataStore[att.assignmentId][att.subId]) {
                dataStore[att.assignmentId][att.subId].attachments.push(att);
            }
        });

        return dataStore;
    }

    // --- UI RENDERING ---
    function renderData(dataStore) {
        dataContainer.innerHTML = ''; // Clear previous content

        const assignmentIds = Object.keys(dataStore).sort();

        if (assignmentIds.length === 0) {
            dataContainer.innerHTML = '<p class="no-data-message">Keine gespeicherten Arbeiten gefunden.</p>';
            return;
        }

        assignmentIds.forEach(assignmentId => {
            const assignmentContainer = document.createElement('details');
            assignmentContainer.className = 'assignment-container';
            assignmentContainer.open = true; // Open by default

            const assignmentSummary = document.createElement('summary');
            assignmentSummary.textContent = `Kapitel: ${assignmentId}`;
            assignmentContainer.appendChild(assignmentSummary);

            const subIds = Object.keys(dataStore[assignmentId]).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

            subIds.forEach(subId => {
                const subData = dataStore[assignmentId][subId];
                const subContainer = document.createElement('details');
                subContainer.className = 'sub-container';

                const subSummary = document.createElement('summary');
                subSummary.textContent = `Thema: ${subId}`;
                subContainer.appendChild(subSummary);

                const subContent = document.createElement('div');
                subContent.className = 'sub-content';

                // Render Questions
                const questionKeys = Object.keys(subData.questions).sort((a, b) => (parseInt(a.replace('question', ''), 10) - parseInt(b.replace('question', ''), 10)));
                if (questionKeys.length > 0) {
                    const questionsList = document.createElement('ol');
                    questionsList.className = 'questions-list';
                    questionKeys.forEach(key => {
                        const li = document.createElement('li');
                        li.innerHTML = subData.questions[key]; // Questions might contain markdown-like formatting
                        questionsList.appendChild(li);
                    });
                    subContent.appendChild(questionsList);
                }

                // Render Answer
                if (subData.answer) {
                    const answerDiv = document.createElement('div');
                    answerDiv.className = 'answer-content';
                    answerDiv.innerHTML = `<h4>Antwort:</h4>${subData.answer}`;
                    subContent.appendChild(answerDiv);
                }

                // Render Attachments
                if (subData.attachments.length > 0) {
                    const attachmentsDiv = document.createElement('div');
                    attachmentsDiv.className = 'attachments-display';
                    attachmentsDiv.innerHTML = '<h4>Anhänge:</h4>';
                    subData.attachments.forEach(att => {
                        if (att.fileType && att.fileType.startsWith('image/')) {
                            const img = document.createElement('img');
                            img.src = att.data;
                            img.alt = att.fileName;
                            img.title = att.fileName;
                            attachmentsDiv.appendChild(img);
                        } else {
                            const link = document.createElement('a');
                            link.href = att.data;
                            link.download = att.fileName;
                            link.textContent = `Download: ${att.fileName}`;
                            attachmentsDiv.appendChild(link);
                        }
                    });
                    subContent.appendChild(attachmentsDiv);
                }

                subContainer.appendChild(subContent);
                assignmentContainer.appendChild(subContainer);
            });

            dataContainer.appendChild(assignmentContainer);
        });
    }

    // --- DESTRUCTIVE ACTIONS ---
    function clearAllData() {
        const confirmation1 = confirm("Bist du absolut sicher, dass du ALLE gespeicherten Arbeiten und Anhänge löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.");
        if (!confirmation1) return;

        const confirmation2 = confirm("Letzte Warnung: Wirklich ALLE Daten löschen?");
        if (!confirmation2) return;

        // 1. Clear localStorage
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('textbox-')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log("Cleared relevant localStorage keys.");

        // 2. Clear IndexedDB object store
        if (db) {
            const transaction = db.transaction([ATTACHMENT_STORE], 'readwrite');
            const store = transaction.objectStore(ATTACHMENT_STORE);
            const request = store.clear();
            request.onsuccess = () => {
                console.log("Cleared IndexedDB attachment store.");
                alert("Alle Daten wurden erfolgreich gelöscht.");
                loadAndDisplayData(); // Refresh the view
            };
            request.onerror = (e) => {
                console.error("Error clearing IndexedDB:", e.target.error);
                alert("Fehler beim Löschen der Anhänge. Die Textantworten wurden jedoch gelöscht.");
                loadAndDisplayData(); // Refresh anyway
            };
        } else {
            alert("Alle Textantworten wurden gelöscht. Die Datenbank für Anhänge war nicht erreichbar.");
            loadAndDisplayData();
        }
    }

    // --- INITIALIZATION & EVENT LISTENERS ---
    document.addEventListener('DOMContentLoaded', () => {
        loadAndDisplayData();
        reloadDataBtn.addEventListener('click', loadAndDisplayData);
        clearAllDataBtn.addEventListener('click', clearAllData);
    });

})();