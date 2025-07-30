// =================================================================================
// ORGANIZE (ORGANIZAR)
// =================================================================================

// --- CONSTS DO ORGANIZE ---
const organizeBtn = document.getElementById('organize-btn');
const startOrganizeBtn = document.getElementById('start-organize');
const organizeButtons = document.getElementById('organize-function-buttons');
const selectAllBtn = document.getElementById('select-all-btn');
const rotateSelectedBtn = document.getElementById('rotate-selected-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');


// --- FUNÇÕES DO ORGANIZE ---

function disableFileInputAndDropZone() {
    if (fileInput) fileInput.disabled = true;
    if (dropZone) dropZone.classList.add('disabled-upload');
}

function enableFileInputAndDropZone() {
    if (fileInput) fileInput.disabled = false;
    if (dropZone) dropZone.classList.remove('disabled-upload');
}

async function renderModulePreviews() {
    await rebuildPreviews();
}

/**
 * Reconstrói e atualiza as pré-visualizações para o modo Split.
 */
async function rebuildPreviews() {
    if (!previewContainer) {
        console.error("Elemento 'sortable-preview' não foi encontrado no DOM. Verifique o HTML.");
        return;
    }

    previewContainer.innerHTML = ''; // limpa previews antigos

    if (selectedFiles.length === 0) {
        showError('Nenhum arquivo selecionado para organizar.', errorMessage);
        if (fileInput) fileInput.disabled = false;
        if (dropZone) dropZone.classList.remove('disabled-upload');
        return;
    }

    if (selectedFiles.length > 1) {
        showError('Apenas um arquivo pode ser organizado por vez.', errorMessage);
        
        // Mantém só o primeiro arquivo, removendo os extras
        selectedFiles = [selectedFiles[0]];

        // Atualiza o input para só ter o primeiro arquivo
        if (fileInput) {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(selectedFiles[0]);
            fileInput.files = dataTransfer.files;
        }
    } else {
        // Limpa erro se só tiver 1 arquivo
        hideError();
    }

    // Bloqueia novos uploads
    if (fileInput) fileInput.disabled = true;
    if (dropZone) dropZone.classList.add('disabled-upload');

    // Cria preview do arquivo único
    const previewElement = await createPreview(selectedFiles[0], 0);
    previewContainer.appendChild(previewElement);

    checkPreviewVisibility();
}



/**
 * Gera pré-visualizações das páginas de um PDF para organização, com lazy loading.
 */
async function generateOrganizePreviews() {
    if (selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    const buffer = await file.arrayBuffer();
    pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;

    if (previewContainer) previewContainer.innerHTML = '';

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('preview-wrapper', 'lazy-load');
        wrapper.dataset.pageNum = pageNum;
        wrapper.dataset.rotation = 0;
        wrapper.style.minHeight = '200px';

        const placeholder = document.createElement('div');
        placeholder.classList.add('preview-placeholder');
        placeholder.textContent = `Página ${pageNum} (carregando...)`;
        wrapper.appendChild(placeholder);

        const pageNumberElement = document.createElement('div');
        pageNumberElement.classList.add('page-number');
        pageNumberElement.textContent = `${pageNum}`;
        wrapper.appendChild(pageNumberElement);

        wrapper.addEventListener('click', (e) => {
            if (e.target.classList.contains('rotate-btn')) return;
            wrapper.classList.toggle('selected');
            if (wrapper.classList.contains('selected')) {
                if (!selectedWrappers.includes(wrapper)) selectedWrappers.push(wrapper);
            } else {
                selectedWrappers = selectedWrappers.filter(w => w !== wrapper);
            }
        });

        if (previewContainer) previewContainer.appendChild(wrapper);
    }

    if (intersectionObserver) intersectionObserver.disconnect();
    intersectionObserver = new IntersectionObserver(handleIntersection, {
        root: previewContainer.parentElement,
        rootMargin: '0px 0px 100px 0px',
        threshold: 0.1
    });

    document.querySelectorAll('.preview-wrapper.lazy-load').forEach(wrapper => {
        intersectionObserver.observe(wrapper);
    });

    if (previewContainer) {
        Sortable.create(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
        });
    }

    const containerGrid = document.getElementById('preview-container-grid');
    if (containerGrid) containerGrid.style.display = 'block';
}

/**
 * Callback para o IntersectionObserver. Carrega a pré-visualização quando um wrapper entra na viewport.
 * @param {Array<IntersectionObserverEntry>} entries
 * @param {IntersectionObserver} observer
 */
async function handleIntersection(entries, observer) {
    for (const entry of entries) {
        if (entry.isIntersecting && entry.target.classList.contains('lazy-load')) {
            observer.unobserve(entry.target);
            entry.target.classList.remove('lazy-load');

            const wrapper = entry.target;
            const pageNum = parseInt(wrapper.dataset.pageNum);
            let rotation = parseInt(wrapper.dataset.rotation) || 0;

            const placeholder = wrapper.querySelector('.preview-placeholder');
            if (placeholder) placeholder.remove();

            if (!pdfDocument) {
                console.error("PDF Documento não carregado para renderizar a página.");
                return;
            }

            const page = await pdfDocument.getPage(pageNum);
            const canvas = document.createElement('canvas');
            canvas.classList.add('preview-canvas');

            const renderPage = async (canvasElem, pdfPage, scale, rotationAngle) => {
                const viewport = pdfPage.getViewport({ scale, rotation: rotationAngle });
                canvasElem.width = viewport.width;
                canvasElem.height = viewport.height;
                const context = canvasElem.getContext('2d');
                await pdfPage.render({ canvasContext: context, viewport }).promise;
            };

            await renderPage(canvas, page, 0.5, rotation);

            const pageNumberElement = wrapper.querySelector('.page-number');
            if (pageNumberElement) {
                wrapper.insertBefore(canvas, pageNumberElement);
            } else {
                wrapper.appendChild(canvas);
            }

            const rotateBtn = document.createElement('button');
            rotateBtn.textContent = ' ⟳ ';
            rotateBtn.classList.add('rotate-btn');
            rotateBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // --- CORREÇÃO 1 AQUI ---
                let currentRotation = ((parseInt(wrapper.dataset.rotation) || 0) + 90) % 360;
                wrapper.dataset.rotation = currentRotation;
                await renderPage(canvas, page, 0.5, currentRotation);
            });
            wrapper.appendChild(rotateBtn);
        }
    }
}

/**
 * Limpa todas as seleções de página nas pré-visualizações de organização.
 */
function clearPageSelections() {
    document.querySelectorAll('.preview-wrapper.selected').forEach(wrapper => {
        wrapper.classList.remove('selected');
    });
    selectedWrappers = [];
}


// --- LISTENERS DO ORGANIZE ---

// Listener principal para iniciar a funcionalidade de organização
document.addEventListener('DOMContentLoaded', () => {
    
    if (organizeBtn) {
        organizeBtn.addEventListener('click', async () => {
            hideAllErrors();

            // ✅ Verifica antes de abrir o menu
            if (!selectedFiles || selectedFiles.length !== 1) {
                showError('Por favor, selecione um arquivo por vez para organizar.', errorMessage2);
                return;
            }

            // ✅ Agora sim, abre o menu com tudo certo
            openMenu(organizeMenu);

            if (typeof fileInput !== 'undefined' && fileInput) fileInput.disabled = true;
            if (typeof dropZone !== 'undefined' && dropZone) dropZone.classList.add('disabled-upload');

            if (mainButtons) mainButtons.style.display = 'none';
            if (organizeButtons) organizeButtons.style.display = 'flex';

            previewContainer.innerHTML = ''; // limpa container antes de gerar preview completo

            await generateOrganizePreviews();

            previewTitle.textContent = 'Organize as páginas na ordem desejada:';
        });
    }
});

// Listener para o botão que efetivamente executa a organização no servidor
if (startOrganizeBtn) {
    startOrganizeBtn.addEventListener('click', async () => {
        hideAllErrors();
        showSpinner();

        const pageOrder = Array.from(previewContainer.children).map(div => ({
            page: parseInt(div.dataset.pageNum),
            rotation: parseInt(div.dataset.rotation) || 0
        }));

        const formData = new FormData();
        formData.append('pdf', selectedFiles[0]);
        formData.append('order', JSON.stringify(pageOrder));

        try {
            const response = await fetch('/organize', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) throw new Error('Erro na resposta do servidor.');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'organized.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setTimeout(() => resetApp(), 3000);

        } catch (error) {
            console.error('Erro ao organizar PDF:', error);
            showError('Ocorreu um erro ao organizar o PDF.');
        } finally {
            hideSpinner();
            closeMenu(organizeMenu);
        }
    });
}

// Listener para o botão de desselecionar todas as páginas
if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
        if (selectedWrappers.length === 0) {
            showError('Não há nenhuma página selecionada.');
        }
        clearPageSelections();
    });
}

// Listener para o botão de selecionar todas as páginas
if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        const wrappers = previewContainer.querySelectorAll('.preview-wrapper');
        wrappers.forEach(wrapper => wrapper.classList.add('selected'));
        selectedWrappers = Array.from(wrappers);
        hideError();
    });
}

// Listener para o botão de girar as páginas selecionadas
if (rotateSelectedBtn) {
    rotateSelectedBtn.addEventListener('click', async () => {
        if (selectedWrappers.length === 0) {
            showError('Por favor, selecione ao menos uma página para girar.');
            return;
        }
        hideError();

        // Reutiliza o pdfDocument já carregado
        if (!pdfDocument) {
            console.error("PDF Document não encontrado para rotação.");
            return;
        }

        for (const wrapper of selectedWrappers) {
            const canvas = wrapper.querySelector('canvas');
            if (!canvas) continue; // Pula se a página ainda não foi renderizada

            const pageNum = parseInt(wrapper.dataset.pageNum);
            // --- CORREÇÃO 2 AQUI ---
            let rotation = ((parseInt(wrapper.dataset.rotation) || 0) + 90) % 360;
            wrapper.dataset.rotation = rotation;

            const page = await pdfDocument.getPage(pageNum);
            const viewport = page.getViewport({ scale: 0.5, rotation: rotation });

            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({
                canvasContext: canvas.getContext('2d'),
                viewport
            }).promise;
        }
    });
}