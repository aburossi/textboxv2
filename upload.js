// upload.js
(function() {
    'use strict';

    // IMPORTANT: Make sure this URL matches the one in your main script.js
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbze5K91wdQtilTZLU8IW1iRIrXnAhlhf4kLn4xq0IKXIS7BCYN5H3YZlz32NYhqgtcLSA/exec';
    const statusEl = document.getElementById('uploadStatus');
    const fileInput = document.getElementById('fileInput');

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

        // Resize image for performance before uploading
        const imageDataUrl = await resizeImage(file, 1024); // Resize to max 1024px width/height

        statusEl.textContent = "Bild wird hochgeladen...";

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'cors',
                body: JSON.stringify({
                    action: 'uploadImage',
                    sessionId: sessionId,
                    imageData: imageDataUrl
                })
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                statusEl.textContent = "Erfolg! Das Bild wurde an deinen Computer gesendet. Du kannst dieses Fenster schliessen.";
                statusEl.style.color = 'green';
                document.getElementById('uploadLabel').style.display = 'none'; // Hide button after success
            } else {
                throw new Error(result.message || 'Serverfehler.');
            }
        } catch (error) {
            console.error('Upload failed:', error);
            statusEl.textContent = `Upload fehlgeschlagen: ${error.message}`;
            statusEl.style.color = 'red';
        }
    });

    // Helper function to resize the image client-side
    function resizeImage(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxSize) {
                            height *= maxSize / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width *= maxSize / height;
                            height = maxSize;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL(file.type)); // Get data URL of the resized image
                };
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
})();