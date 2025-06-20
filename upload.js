// upload.js (Corrected with URL)
(function() {
    'use strict';

    // Your new Google Apps Script URL is pasted here
    const IMAGE_UPLOAD_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbybPrhlVFPiDA2Lk0BQx9tuV_r8r43cfCZZpzpQHv6gsRL9AC3M4eClOA3rOcEbE6-X/exec';

    const statusEl = document.getElementById('uploadStatus');
    const fileInput = document.getElementById('fileInput');
    const uploadLabel = document.getElementById('uploadLabel');

    if (!IMAGE_UPLOAD_SCRIPT_URL || IMAGE_UPLOAD_SCRIPT_URL.includes('YOUR_NEW_IMAGE_UPLOAD_SCRIPT_URL')) {
        statusEl.textContent = 'Fehler: Das Upload-Skript ist nicht konfiguriert.';
        statusEl.style.color = 'red';
        uploadLabel.style.backgroundColor = '#ccc';
        uploadLabel.style.cursor = 'not-allowed';
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('sessionId');

    if (!sessionId) {
        statusEl.textContent = "Fehler: Keine Session-ID gefunden. Bitte QR-Code erneut scannen.";
        statusEl.style.color = 'red';
        return;
    }

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        statusEl.textContent = "Bild wird verarbeitet...";
        statusEl.style.color = 'black';
        uploadLabel.style.display = 'none';

        const imageDataUrl = await resizeImage(file, 1200);

        statusEl.textContent = "Bild wird hochgeladen...";

        try {
            const response = await fetch(IMAGE_UPLOAD_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify({
                    action: 'uploadImage',
                    sessionId: sessionId,
                    imageData: imageDataUrl
                }),
                headers: { 'Content-Type': 'text/plain;charset=utf-8' }
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                statusEl.textContent = "Erfolg! Das Bild wurde an deinen Computer gesendet. Du kannst dieses Fenster schliessen.";
                statusEl.style.color = 'green';
            } else {
                throw new Error(result.message || 'Serverfehler.');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            statusEl.textContent = `Upload fehlgeschlagen: ${error.message}`;
            statusEl.style.color = 'red';
            uploadLabel.style.display = 'block';
        }
    });

    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxSize) { height *= maxSize / width; width = maxSize; }
                    } else {
                        if (height > maxSize) { width *= maxSize / height; height = maxSize; }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.9));
                };
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
})();