// compressor.js

const compressBtn = document.querySelector('.function-btn'); // Botão principal do compressor
const startButton = document.getElementById('start-compression'); // Botão "Iniciar Compressão"
const progressBar = document.getElementById('progress-bar');

// Limites só do módulo de compressão
const MAX_COMPRESS_FILES = 10;
const MAX_TOTAL_MB = 1024; // MB

let selectedCompression = null; // Tipo de compressão selecionado

/**
 * Função de renderização de previews específica para o módulo de compressão.
 * Usa selectedFiles (lista) e mostra preview do primeiro.
 */
async function renderModulePreviews() {
    const pdfPreviewContainer = document.getElementById("pdf-preview-container");
    const pdfCanvas = document.getElementById("pdf-canvas");
    const pdfInfo = document.getElementById("pdf-info");
    const filesList = document.getElementById("pdf-files-list");

    if (!pdfPreviewContainer || !pdfCanvas) {
        // Estamos em outra tela (merge/split/organize), deixa o global cuidar
        return;
    }

    // Garante que selectedFiles exista
    if (!Array.isArray(selectedFiles)) {
        selectedFiles = [];
    }

    // Se não tiver nada ainda mas tiver selectedFile, coloca ele na lista
    if (selectedFiles.length === 0 && selectedFile) {
        selectedFiles.push(selectedFile);
    }

    // --- LIMITES (APENAS NO COMPRESSOR) ---
    if (selectedFiles.length > MAX_COMPRESS_FILES) {
        selectedFiles = selectedFiles.slice(0, MAX_COMPRESS_FILES);
        if (typeof showError === 'function') {
            showError(`Você selecionou mais de ${MAX_COMPRESS_FILES} arquivos. Somente os primeiros ${MAX_COMPRESS_FILES} serão considerados.`);
        }
    }

    const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    const totalMB = totalBytes / (1024 * 1024);

    if (totalMB > MAX_TOTAL_MB) {
        if (typeof showError === 'function') {
            showError(`O total dos arquivos selecionados é de ${totalMB.toFixed(2)} MB e excede o limite de ${MAX_TOTAL_MB} MB. Remova alguns arquivos e tente novamente.`);
        }
        selectedFiles = [];
        selectedFile = null;
        if (pdfInfo) pdfInfo.textContent = "";
        const ctx = pdfCanvas.getContext("2d");
        ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        pdfPreviewContainer.style.display = "none";
        if (typeof checkPreviewVisibility === 'function') {
            checkPreviewVisibility();
        }
        if (filesList) filesList.innerHTML = "";
        return;
    }

    // Se não sobrou nenhum depois dos filtros
    if (selectedFiles.length === 0) {
        selectedFile = null;
        if (compressBtn) compressBtn.disabled = true;
        pdfPreviewContainer.style.display = "none";
        if (pdfInfo) pdfInfo.textContent = "";
        const ctx = pdfCanvas.getContext("2d");
        ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
        if (filesList) filesList.innerHTML = "";
        return;
    }

    const totalFiles = selectedFiles.length;
    if (typeof updateFilesList === "function") {
        updateFilesList();
    }
    // Preview inicial = primeiro arquivo
    const firstFile = selectedFiles[0];
    renderFilePreview(firstFile, 0, totalFiles, totalMB);

    if (compressBtn) compressBtn.disabled = false;
}

function renderFilePreview(file, index, totalFiles, totalMB) {
    const pdfPreviewContainer = document.getElementById("pdf-preview-container");
    const pdfCanvas = document.getElementById("pdf-canvas");
    const pdfInfo = document.getElementById("pdf-info");

    if (!file || !pdfCanvas || !pdfPreviewContainer) return;

    // arquivo atualmente focado
    selectedFile = file;

    if (typeof hideAllErrors === 'function') hideAllErrors();
    pdfPreviewContainer.style.display = "block";

    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

    if (pdfInfo) {
        pdfInfo.textContent =
            `📦 ${totalFiles} arquivo(s) (${totalMB.toFixed(2)} MB no total) • ` +
            `Exibindo ${index + 1}/${totalFiles}: ${file.name} (${sizeMB} MB) • ` +
            `📄 Lendo número de páginas...`;
    }

    const reader = new FileReader();
    reader.onload = function () {
        const typedarray = new Uint8Array(this.result);
        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            const totalPages = pdf.numPages;

            if (totalPages > 1000 && typeof errorMessage !== 'undefined' && errorMessage) {
                errorMessage.textContent = "Este arquivo possui muitas páginas e pode demorar mais para ser processado. Recomendamos aguardar com paciência.";
                errorMessage.style.display = "block";
            }

            if (pdfInfo) {
                pdfInfo.textContent =
                    `📦 ${totalFiles} arquivo(s) (${totalMB.toFixed(2)} MB no total) • ` +
                    `Exibindo ${index + 1}/${totalFiles}: ${file.name} (${sizeMB} MB) • ` +
                    `📄 Páginas: ${totalPages}`;
            }

            pdf.getPage(1).then(page => {
                const viewport = page.getViewport({ scale: 1.5 });
                const ctx = pdfCanvas.getContext("2d");
                pdfCanvas.height = viewport.height;
                pdfCanvas.width = viewport.width;
                page.render({ canvasContext: ctx, viewport });

                // remove botão velho antes de criar um novo
                const oldRemoveBtn = pdfPreviewContainer.querySelector('.remove-btn');
                if (oldRemoveBtn) oldRemoveBtn.remove();

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '×';
                removeBtn.classList.add('remove-btn');
                removeBtn.title = 'Remover este arquivo';

                removeBtn.style.position = 'absolute';
                removeBtn.style.top = '5px';
                removeBtn.style.right = '5px';
                removeBtn.style.zIndex = '10';
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.fontSize = '20px';
                removeBtn.style.background = 'transparent';
                removeBtn.style.border = 'none';
                removeBtn.style.color = '#f00';

                removeBtn.addEventListener('click', () => {
                    // remove somente esse arquivo da lista
                    const idx = selectedFiles.indexOf(file);
                    if (idx !== -1) {
                        selectedFiles.splice(idx, 1);
                    }

                    if (selectedFiles.length === 0) {
                        selectedFile = null;
                        if (pdfInfo) pdfInfo.textContent = "";
                        const ctx2 = pdfCanvas.getContext("2d");
                        ctx2.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);
                        pdfPreviewContainer.style.display = "none";
                        if (typeof checkPreviewVisibility === 'function') {
                            checkPreviewVisibility();
                        }
                        if (typeof resetApp === 'function') {
                            resetApp();
                        }
                    } else {
                        // Re-renderiza tudo com a nova lista
                        renderModulePreviews();
                    }
                });

                pdfPreviewContainer.style.position = 'relative';
                pdfPreviewContainer.appendChild(removeBtn);
            });
        }).catch(err => {
            if (pdfInfo) pdfInfo.textContent = `Erro ao ler número de páginas.`;
            console.error(err);
        });
    };
    reader.readAsArrayBuffer(file);
}

/**
 * Seleciona o tipo de compressão e atualiza a interface.
 */
function selectCompression(element) {
    document.querySelectorAll('.compression-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.style.opacity = '0.6';
    });
    element.classList.add('selected');
    element.style.opacity = '1';
    selectedCompression = element.getAttribute('data-type');
    if (startButton) startButton.disabled = false;
}

/**
 * Inicia o processo de compressão, agora podendo enviar vários arquivos.
 */
// Flag global para impedir compressões duplicadas
let isCompressing = false;

function startCompression() {
    if (isCompressing) {
        console.warn("Compressão já em andamento — ignorado.");
        return;
    }

    isCompressing = true;           // trava dupla compressão
    startButton.disabled = true;    // trava o botão imediatamente

    const filesToSend =
        (Array.isArray(selectedFiles) && selectedFiles.length > 0)
            ? selectedFiles
            : (selectedFile ? [selectedFile] : []);

    if (filesToSend.length === 0 || !selectedCompression) {
        if (errorMessage) {
            errorMessage.textContent = "Por favor, selecione ao menos um arquivo e o tipo de compressão.";
            errorMessage.style.display = "block";
        }
        startButton.disabled = false;
        isCompressing = false;
        return;
    }

    const formData = new FormData();
    filesToSend.forEach(file => formData.append('files', file));
    formData.append('compression', selectedCompression);

    if (progressContainer) progressContainer.style.display = 'block';
    if (statusMessage) {
        statusMessage.style.display = 'block';
        statusMessage.textContent = filesToSend.length > 1
            ? 'Enviando arquivos...'
            : 'Enviando arquivo...';
    }
    fetch('/compress', {
        method: 'POST',
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            if (statusMessage) statusMessage.textContent = `Erro: ${data.error}`;
            startButton.disabled = false;
            isCompressing = false;
            return;
        }

        const taskId = data.task_id;
        pollProgress(taskId);
    })
    .catch(error => {
        console.error('Erro ao iniciar compressão:', error);
        if (statusMessage) statusMessage.textContent = 'Erro ao iniciar compressão.';

        startButton.disabled = false;
        isCompressing = false;
    });
}


/**
 * Poll de progresso – continua igual, só lida com summary de múltiplos também.
 */
function pollProgress(taskId) {
    const interval = setInterval(() => {
        fetch(`/progress/${taskId}`)
            .then(response => {
                if (!response.ok) throw new Error("Erro ao verificar progresso");
                return response.json();
            })
            .then(data => {
                const percent = data.percent;
                const status = data.status;
                const summary = data.summary || null;

                if (progressBar) {
                    const currentWidth = parseFloat(progressBar.style.width) || 0;
                    const newWidth = currentWidth + (percent - currentWidth) * 0.3;
                    progressBar.style.width = newWidth + '%';

                    if (percent > 0 && percent < 100) {
                        progressBar.classList.add('animated');
                    } else {
                        progressBar.classList.remove('animated');
                    }
                }

                if (percent < 100) {
                    if (statusMessage) {
                        statusMessage.style.display = 'block';
                        statusMessage.textContent = `🛠️ ${status}`;
                    }
                } else {
                    clearInterval(interval);

                    if (statusMessage) {
                        let msg = '✅ Compressão concluída!';
                        if (summary) {
                            const inMb = summary.input_mb;
                            const outMb = summary.output_mb;
                            const pct = summary.reduction_pct;
                            const filesCount = summary.files_count;

                            if (filesCount && filesCount > 1) {
                                msg += ` ${filesCount} arquivos comprimidos. Redução média de ${pct}% (${inMb.toFixed(2)} MB → ${outMb.toFixed(2)} MB em ${summary.time_s}s).`;
                            } else if (inMb != null && outMb != null && pct != null) {
                                msg += ` Redução de ${pct}% (${inMb.toFixed(2)} MB → ${outMb.toFixed(2)} MB em ${summary.time_s}s).`;
                            }
                        }
                        statusMessage.style.display = 'block';
                        statusMessage.textContent = msg;
                    }

                    setTimeout(() => {
                        window.location.href = `/download/${taskId}`;

                        setTimeout(() => {
                            if (typeof resetApp === 'function') {
                                resetApp();
                            }
                        }, 2000);
                    }, 1500);
                }
            })
            .catch(err => {
                clearInterval(interval);
                console.error('Erro ao buscar progresso:', err);
                if (statusMessage) {
                    statusMessage.style.display = 'block';
                    statusMessage.textContent = 'Erro ao buscar progresso.';
                }
            });
    }, 1000);
}

// --- Listeners de Eventos do Compressor ---
document.addEventListener('DOMContentLoaded', () => {
    if (compressBtn) {
        compressBtn.addEventListener('click', () => {
            if (!selectedFile && (!selectedFiles || selectedFiles.length === 0)) {
                showError && showError("Por favor, selecione um arquivo PDF para comprimir.");
            } else {
                openMenu && openMenu(compressionMenu, [mergeMenu, splitMenu, organizeMenu, convertMenu]);
            }
        });
    }

    if (startButton) {
        startButton.addEventListener('click', startCompression);
    }

    document.querySelectorAll('.compression-option').forEach(opt => {
        opt.addEventListener('click', function () {
            selectCompression(this);
        });
    });
});

function updateFilesList() {
    const list = document.getElementById("pdf-files-list");
    if (!list) return;

    list.innerHTML = "";

    const totalBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);
    const totalMB = totalBytes / (1024 * 1024);

    selectedFiles.forEach((file, index) => {
        const item = document.createElement("div");
        item.classList.add("pdf-file-item");

        // marca ativo se for o selectedFile ou o primeiro
        const isActive = selectedFile
            ? selectedFile === file
            : index === 0;

        if (isActive) {
            item.classList.add("active");
        }

        const name = document.createElement("span");
        name.classList.add("pdf-file-item-name");
        name.textContent = file.name;

        const size = document.createElement("span");
        size.classList.add("pdf-file-item-size");
        size.textContent = (file.size / (1024 * 1024)).toFixed(2) + " MB";

        const del = document.createElement("span");
        del.classList.add("pdf-file-item-delete");
        del.textContent = "×";
        del.title = "Remover";

        del.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedFiles.splice(index, 1);
            // se remover o que estava selecionado, limpa selectedFile
            if (selectedFile === file) {
                selectedFile = null;
            }
            renderModulePreviews(); // já recalcula tudo e lista de novo
        });

        item.addEventListener("click", () => {
            selectedFile = file;

            // atualiza active visualmente
            list.querySelectorAll(".pdf-file-item").forEach(el => {
                el.classList.remove("active");
            });
            item.classList.add("active");

            renderFilePreview(file, index, selectedFiles.length, totalMB);
        });

        item.appendChild(name);
        item.appendChild(size);
        item.appendChild(del);
        list.appendChild(item);
    });
}
