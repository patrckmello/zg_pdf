
const splitBtn = document.getElementById('split-btn');
const mergeBtn = document.getElementById('merge-btn');
const organizeBtn = document.getElementById('organize-btn');
const startMergeBtn = document.getElementById('start-merge');
const startSplitBtn = document.getElementById('start-split');
const startOrganizeBtn = document.getElementById('start-organize');

const previewContainer = document.getElementById('sortable-preview');
const sortMenu = document.getElementById('sort-menu');
const sortAscBtn = document.getElementById('sort-asc-btn');
const sortDescBtn = document.getElementById('sort-desc-btn');
const modeButtons = document.querySelectorAll('.mode-btn');
const partsOption = document.getElementById('parts-option');
const sizeOption = document.getElementById('size-option');
const previewTitle = document.getElementById('preview-title');
const mainButtons = document.getElementById('main-function-buttons');
const organizeButtons = document.getElementById('organize-function-buttons');
const selectAllBtn = document.getElementById('select-all-btn');
const rotateSelectedBtn = document.getElementById('rotate-selected-btn');
const backBtn = document.getElementById('back-btn');
const deselectAllBtn = document.getElementById('deselect-all-btn');
const PREVIEW_BATCH_SIZE = 20;
let selectedSplitMode = null;
let selectedWrappers = []; 
let intersectionObserver = null;
let pdfDocument = null;


async function renderModulePreviews() {
    // Para merge/split, rebuildPreviews já faz o trabalho.
    // Para organize, generateOrganizePreviews faz o trabalho (mas é chamado só no clique do organizeBtn).
    
    await rebuildPreviews();
}

/**
 * Verifica se um nome de arquivo é composto apenas por dígitos (numérico).
 * @param {string} name - O nome do arquivo (sem extensão).
 * @returns {boolean} - Verdadeiro se o nome for numérico, falso caso contrário.
 */
function isNumericName(name) {
    return /^\d+$/.test(name.split('.').shift());
}

/**
 * Reconstroi e atualiza as pré-visualizações dos arquivos selecionados,
 * configurando a funcionalidade de arrastar e soltar (Sortable.js).
 * Utilizado para Merge/Split (múltiplos arquivos).
 */
async function rebuildPreviews() {
    if (previewContainer) previewContainer.innerHTML = '';

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        await createPreview(file, i);
    }
    updatePreviewIndices();
    updateMergeButtonState();
    checkPreviewVisibility();

    if (sortableInstance) sortableInstance.destroy();
    if (previewContainer) {
        sortableInstance = Sortable.create(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onSort: function(evt) {
                const newOrderFileNames = Array.from(evt.to.children).map(item => item.getAttribute('data-filename'));
                const reorderedSelectedFiles = [];
                newOrderFileNames.forEach(fileName => {
                    const file = selectedFiles.find(f => f.name === fileName);
                    if (file) {
                        reorderedSelectedFiles.push(file);
                    }
                });
                selectedFiles = reorderedSelectedFiles;
                updatePreviewIndices();
            }
        });
    }
}

/**
 * Cria uma pré-visualização de um arquivo PDF específico.
 * Utilizado para os previews de Merge/Split.
 * @param {File} file - O arquivo PDF.
 * @param {number} index - O índice do arquivo na lista de selectedFiles.
 * @returns {Promise<void>} Uma promessa que resolve quando a pré-visualização é criada.
 */
function createPreview(file, index) {
    return new Promise((resolve) => {
        const fileReader = new FileReader();
        fileReader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const page = await pdf.getPage(1);
            const MAX_PREVIEW_WIDTH = 150;
            const originalViewport = page.getViewport({ scale: 1 }); // Viewport original (escala 1)
            let scale = 1;

            if (originalViewport.width > MAX_PREVIEW_WIDTH) {
                scale = MAX_PREVIEW_WIDTH / originalViewport.width;
            }

            const viewport = page.getViewport({ scale: scale });

            const wrapper = document.createElement('div');
            wrapper.classList.add('preview-wrapper');
            wrapper.setAttribute('data-index', index);
            wrapper.setAttribute('data-filename', file.name);

            const canvas = document.createElement('canvas');
            canvas.classList.add('preview-canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const context = canvas.getContext('2d');
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.classList.add('remove-btn');
            removeBtn.title = 'Remover arquivo';

            removeBtn.addEventListener('click', () => {
                if (previewContainer) previewContainer.removeChild(wrapper);
                const idx = selectedFiles.findIndex(f => f.name === file.name);
                if (idx !== -1) {
                    selectedFiles.splice(idx, 1);
                }
                if (selectedFiles.length === 0) {
                    resetApp();
                } else {
                    rebuildPreviews();
                }
            });

            const fileNameElement = document.createElement('p');
            fileNameElement.textContent = file.name;
            fileNameElement.classList.add('file-name');

            wrapper.appendChild(fileNameElement);
            wrapper.appendChild(canvas);
            wrapper.appendChild(removeBtn);
            if (previewContainer) previewContainer.appendChild(wrapper);
            resolve();
        };
        fileReader.readAsArrayBuffer(file);
    });
}

/**
 * Habilita ou desabilita o botão "Unir PDFs" com base na quantidade de arquivos selecionados.
 */
function updateMergeButtonState() {
    if (startMergeBtn) {
        if (previewContainer && previewContainer.children.length > 0) {
            startMergeBtn.disabled = false;
            hideError(errorMessage3); // Oculta erro de merge se o botão for habilitado
        } else {
            startMergeBtn.disabled = true;
        }
    }
}

/**
 * Gera pré-visualizações de páginas para organização de um único PDF.
 */
/**
 * Gera pré-visualizações de páginas para organização de um único PDF, com lazy loading.
 */
async function generateOrganizePreviews() {
    if (selectedFiles.length === 0) return;

    const file = selectedFiles[0];
    const buffer = await file.arrayBuffer();
    // Armazena o PDFDocument para evitar carregá-lo múltiplas vezes
    pdfDocument = await pdfjsLib.getDocument({ data: buffer }).promise;

    if (previewContainer) previewContainer.innerHTML = ''; // Limpa previews antigos

    // Cria placeholders para todas as páginas
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const wrapper = document.createElement('div');
        wrapper.classList.add('preview-wrapper', 'lazy-load'); // Adiciona classe para lazy load
        wrapper.dataset.pageNum = pageNum;
        wrapper.dataset.rotation = 0; // Estado inicial da rotação
        wrapper.style.minHeight = '200px'; // Altura mínima para o observador detectar

        // Adiciona um placeholder visual enquanto carrega
        const placeholder = document.createElement('div');
        placeholder.classList.add('preview-placeholder');
        placeholder.textContent = `Página ${pageNum} (carregando...)`;
        wrapper.appendChild(placeholder);

        // Adiciona o número da página
        const pageNumberElement = document.createElement('div');
        pageNumberElement.classList.add('page-number');
        pageNumberElement.textContent = `${pageNum}`;
        wrapper.appendChild(pageNumberElement);

        // Adiciona listener para seleção (sem renderizar ainda)
        wrapper.addEventListener('click', (e) => {
            if (e.target.classList.contains('rotate-btn')) return;
            wrapper.classList.toggle('selected');
            if (wrapper.classList.contains('selected')) {
                if (!selectedWrappers.includes(wrapper)) {
                    selectedWrappers.push(wrapper);
                }
            } else {
                selectedWrappers = selectedWrappers.filter(w => w !== wrapper);
            }
        });

        if (previewContainer) previewContainer.appendChild(wrapper);
    }

    // Configura o IntersectionObserver para carregar previews quando visíveis
    if (intersectionObserver) {
        intersectionObserver.disconnect(); // Desconecta observador antigo, se houver
    }
    intersectionObserver = new IntersectionObserver(handleIntersection, {
        root: previewContainer.parentElement, // Ou null se quiser observar a viewport
        rootMargin: '0px 0px 100px 0px', // Carrega 100px antes de entrar na tela
        threshold: 0.1 // Dispara quando 10% do elemento está visível
    });

    const lazyWrappers = document.querySelectorAll('.preview-wrapper.lazy-load');
    lazyWrappers.forEach(wrapper => {
        intersectionObserver.observe(wrapper);
    });

    // Inicializa o Sortable.js (com placeholders, o conteúdo será adicionado depois)
    if (previewContainer) {
        // Se você precisar que a reordenação atualize o selectedFiles
        // você precisará ajustar o onSort para lidar com os data-pageNum
        Sortable.create(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onSort: function(evt) {
                // Ao reordenar, a ordem dos data-pageNum nos wrappers no DOM define a nova ordem
                // Isso será usado quando o botão "Organizar" for clicado para reconstruir a ordem
                // Não é necessário atualizar 'selectedFiles' aqui para organização,
                // pois 'selectedFiles' é apenas o arquivo original para organizar.
            }
        });
    }

    const containerGrid = document.getElementById('preview-container-grid');
    if (containerGrid) containerGrid.style.display = 'block';
}

/**
 * Callback para o IntersectionObserver.
 * Carrega a pré-visualização quando um wrapper entra na viewport.
 * @param {Array<IntersectionObserverEntry>} entries
 * @param {IntersectionObserver} observer
 */
async function handleIntersection(entries, observer) {
    for (const entry of entries) {
        if (entry.isIntersecting && entry.target.classList.contains('lazy-load')) {
            observer.unobserve(entry.target); // Para de observar, já que será carregado
            entry.target.classList.remove('lazy-load');

            const wrapper = entry.target;
            const pageNum = parseInt(wrapper.dataset.pageNum);
            let rotation = parseInt(wrapper.dataset.rotation) || 0; // Pega a rotação inicial do dataset

            // Remove o placeholder
            const placeholder = wrapper.querySelector('.preview-placeholder');
            if (placeholder) {
                placeholder.remove();
            }

            // Garante que o pdfDocument foi carregado
            if (!pdfDocument) {
                console.error("PDF Documento não carregado para renderizar a página.");
                return;
            }

            const page = await pdfDocument.getPage(pageNum);
            const canvas = document.createElement('canvas');
            canvas.classList.add('preview-canvas');

            // Função para renderizar uma página no canvas
            const renderPage = async (canvasElem, pdfPage, scale, rotationAngle) => {
                const viewport = pdfPage.getViewport({ scale: scale, rotation: rotationAngle });
                canvasElem.width = viewport.width;
                canvasElem.height = viewport.height;
                const context = canvasElem.getContext('2d');
                await pdfPage.render({ canvasContext: context, viewport }).promise;
            };

            await renderPage(canvas, page, 0.5, rotation); // Renderiza com escala 0.5 e rotação inicial

            // Adiciona o canvas antes do elemento de número de página se ele existir
            const pageNumberElement = wrapper.querySelector('.page-number');
            if (pageNumberElement) {
                wrapper.insertBefore(canvas, pageNumberElement);
            } else {
                wrapper.appendChild(canvas);
            }

            // Adiciona botão de rotação
            const rotateBtn = document.createElement('button');
            rotateBtn.textContent = ' ⟳ ';
            rotateBtn.classList.add('rotate-btn');
            rotateBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                let currentRotation = parseInt(wrapper.dataset.rotation) || 0;
                currentRotation = (currentRotation + 90) % 360;
                wrapper.dataset.rotation = currentRotation;
                await renderPage(canvas, page, 0.5, currentRotation);
            });
            wrapper.appendChild(rotateBtn);
        }
    }
}

/**
 * Atualiza os índices visuais das pré-visualizações.
 */
function updatePreviewIndices() {
    const previews = previewContainer.querySelectorAll('.preview-wrapper');
    previews.forEach((prev, newIndex) => {
        const pageNumberElement = prev.querySelector('.page-number');
        if (pageNumberElement && prev.dataset.pageNum) {
            // Se for um preview de página individual, não altera o dataset.pageNum, que é o original da página
            // A ordem visual é o que importa para Sortable.
        } else {
            prev.setAttribute('data-index', newIndex);
        }
    });
}

/**
 * Limpa todas as seleções de página nas pré-visualizações de organização.
 */
function clearPageSelections() {
    const wrappers = document.querySelectorAll('.preview-wrapper');
    wrappers.forEach(wrapper => {
        wrapper.classList.remove('selected');
    });
    selectedWrappers = [];
}

// --- Funcionalidade de União (Merge) ---

if (startMergeBtn) {
    startMergeBtn.addEventListener('click', () => {
        showSpinner();
        hideAllErrors();

        if (selectedFiles.length === 0) {
            hideSpinner();
            showError(' ⚠️ Por favor, selecione arquivos antes de tentar unir.', errorMessage3); // Usando errorMessage3
            return;
        }
        const orderedFiles = selectedFiles;
        if (orderedFiles.length < 2) {
            hideSpinner();
            showError(' ⚠️ Selecione pelo menos 2 arquivos para realizar a união.', errorMessage3); // Usando errorMessage3
            return;
        }

        const formData = new FormData();
        orderedFiles.forEach(file => {
            formData.append('files', file, file.name);
        });

        fetch('/merge', {
                method: 'POST',
                body: formData,
            })
            .then(response => {
                if (!response.ok) throw new Error('Erro ao unir PDFs');
                return response.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedFiles[0].name}_unido.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                setTimeout(() => {
                    resetApp();
                }, 3000);
            })
            .catch(err => {
                hideSpinner();
                console.error(err);
                showError('Erro ao unir PDFs.', errorMessage3); // Usando errorMessage3
            })
            .finally(() => {
                closeMenu(mergeMenu);
            });
    });
}

// --- Funcionalidade de Divisão (Split) ---

// --- Funcionalidade de Divisão (Split) ---

if (startSplitBtn) {
    startSplitBtn.addEventListener('click', async () => {
        hideAllErrors();
        showSpinner();

        if (selectedFiles.length === 0) {
            hideSpinner();
            showError(' ⚠️ Por favor, selecione pelo menos um arquivo para dividir.');
            return;
        }
        // Adicionada validação: Apenas UM arquivo pode ser dividido por vez
        if (selectedFiles.length > 1) {
            hideSpinner();
            showError(' ⚠️ Por favor, selecione apenas UM arquivo para dividir.');
            return;
        }

        const selectedModeBtn = document.querySelector('.mode-btn.active');
        if (!selectedModeBtn) {
            hideSpinner();
            showError(' ⚠️ Por favor, selecione um modo de divisão.');
            return;
        }

        const mode = selectedModeBtn.dataset.mode;
        const formData = new FormData();
        formData.append('pdfs', selectedFiles[0]); // selectedFiles[0] é o PDF a ser dividido
        formData.append('mode', mode);

        if (mode === 'parts') {
            const partsInput = document.getElementById('split-parts-input');
            const parts = parseInt(partsInput.value);
            // Ajuste na validação mínima para o frontend: partes > 0
            // A validação de 'parts > numPages' será feita no backend.
            if (isNaN(parts) || parts <= 0) {
                hideSpinner();
                showError(' ⚠️ Número de partes inválido. Informe um valor numérico maior que 0.');
                return;
            }
            formData.append('parts', parts);

        } else if (mode === 'size') {
            const sizeInput = document.getElementById('split-size-input');
            const sizeMB = parseFloat(sizeInput.value);
            // Ajuste na validação mínima para o frontend: sizeMB > 0
            if (isNaN(sizeMB) || sizeMB <= 0) {
                hideSpinner();
                showError(' ⚠️ Tamanho inválido. Informe um valor em MB (maior que 0).');
                return;
            }
            formData.append('max_size_mb', sizeMB);
        }

        // --- ATENÇÃO: O BLOCO ABAIXO FOI REMOVIDO PARA EVITAR O TRAVAMENTO NO FRONTEND ---
        // Este é o bloco que lia o PDF inteiro no navegador para verificar o número de páginas.
        // Essa validação agora será feita no backend.
        /*
        try {
            const buffer = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsArrayBuffer(selectedFiles[0]);
            });
            const pdf = await pdfjsLib.getDocument(new Uint8Array(buffer)).promise;
            const numPages = pdf.numPages;

            if (parts > numPages) {
                hideSpinner();
                showError(` ⚠️ O arquivo "${selectedFiles[0].name}" tem apenas ${numPages} página(s). Não é possível dividir em ${parts} partes.`);
                return;
            }
        } catch (e) {
            hideSpinner();
            console.error(`Erro ao processar o arquivo "${selectedFiles[0].name}":`, e);
            showError(` ⚠️ Erro ao processar o arquivo "${selectedFiles[0].name}".`);
            return;
        }
        */
        // --- FIM DO BLOCO REMOVIDO ---


        try {
            const response = await fetch('/split', {
                method: 'POST',
                body: formData
            });

            // Se a resposta não for OK (erro do servidor), tenta ler a mensagem de erro do backend
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido do servidor.' })); // Tenta ler JSON, se falhar, usa mensagem padrão
                throw new Error(errorData.message || 'Erro na resposta do servidor.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'split_result.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setTimeout(() => {
                resetApp();
            }, 3000);

        } catch (error) {
            console.error('Erro ao dividir PDF:', error);
            // Exibe a mensagem de erro vinda do backend ou a mensagem genérica
            showError(` ⚠️ Ocorreu um erro ao dividir o PDF: ${error.message}`);
        } finally {
            hideSpinner();
            // Assumindo que 'splitMenu' está definido e é uma função para fechar o menu
            // Se não for uma função, apenas remova a linha ou ajuste conforme sua implementação
            if (typeof closeMenu === 'function' && typeof splitMenu !== 'undefined') {
                closeMenu(splitMenu);
            }
        }
    });
}

if (modeButtons) {
    modeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (partsOption) partsOption.style.display = 'none';
            if (sizeOption) sizeOption.style.display = 'none';

            if (btn.dataset.mode === 'parts') {
                if (partsOption) partsOption.style.display = 'block';
            } else if (btn.dataset.mode === 'size') {
                if (sizeOption) sizeOption.style.display = 'block';
            }
        });
    });
}

// --- Funcionalidade de Organização (Organize) ---

if (startOrganizeBtn) {
    startOrganizeBtn.addEventListener('click', async () => {
        hideAllErrors();
        showSpinner();

        const file = selectedFiles[0];
        const pageOrder = [];
        Array.from(previewContainer.children).forEach(div => {
            const pageNum = parseInt(div.dataset.pageNum);
            const rotation = parseInt(div.dataset.rotation) || 0;
            pageOrder.push({
                page: pageNum,
                rotation: rotation
            });
        });

        const formData = new FormData();
        formData.append('pdf', file);
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

            setTimeout(() => {
                resetApp();
            }, 3000);

        } catch (error) {
            console.error('Erro ao organizar PDF:', error);
            showError(' ⚠️ Ocorreu um erro ao organizar o PDF.');
        } finally {
            hideSpinner();
            closeMenu(organizeMenu);
        }
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const sortIcon = document.getElementById("sort-icon");
    if (sortIcon) {
        sortIcon.addEventListener("click", function() {
            if (sortMenu) sortMenu.style.display = sortMenu.style.display === "none" ? "block" : "none";
        });
    }

    document.addEventListener("click", function(event) {
        const sortIcon = document.getElementById("sort-icon");
        if (sortMenu && sortIcon && !sortMenu.contains(event.target) && event.target !== sortIcon) {
            sortMenu.style.display = "none";
        }
    });
});

if (deselectAllBtn) {
    deselectAllBtn.addEventListener('click', () => {
        clearPageSelections();
        if (selectedWrappers.length === 0) {
            showError(' ⚠️ Não há nenhuma página selecionada.');
        }
    });
}

if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
        const wrappers = previewContainer.querySelectorAll('.preview-wrapper');
        wrappers.forEach(wrapper => {
            wrapper.classList.add('selected');
        });
        hideError();
        selectedWrappers = Array.from(wrappers);
    });
}

if (rotateSelectedBtn) {
    rotateSelectedBtn.addEventListener('click', async () => {
        if (selectedWrappers.length === 0) {
            showError(' ⚠️ Por favor, selecione ao menos uma página para girar.');
            return;
        }
        hideError();

        const file = selectedFiles[0];
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
            data: buffer
        }).promise;

        for (const wrapper of selectedWrappers) {
            const canvas = wrapper.querySelector('canvas');
            const pageNum = parseInt(wrapper.dataset.pageNum);
            let rotation = parseInt(wrapper.dataset.rotation) || 0;
            rotation = (rotation + 90) % 360;
            wrapper.dataset.rotation = rotation;

            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({
                scale: 0.5,
                rotation: rotation
            });
            if (canvas) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport
                }).promise;
            }
        }
    });
}

if (sortAscBtn) {
    sortAscBtn.addEventListener('click', async () => {
        if (sortMenu) sortMenu.style.display = 'none';
        selectedFiles.sort((a, b) => {
            const nameA = a.name.split('.').shift();
            const nameB = b.name.split('.').shift();
            if (isNumericName(nameA) && isNumericName(nameB)) {
                return Number(nameA) - Number(nameB);
            }
            return nameA.localeCompare(nameB);
        });
        await rebuildPreviews();
    });
}

if (sortDescBtn) {
    sortDescBtn.addEventListener('click', async () => {
        if (sortMenu) sortMenu.style.display = 'none';
        selectedFiles.sort((a, b) => {
            const nameA = a.name.split('.').shift();
            const nameB = b.name.split('.').shift();
            if (isNumericName(nameA) && isNumericName(nameB)) {
                return Number(nameB) - Number(nameA);
            }
            return nameB.localeCompare(nameA);
        });
        await rebuildPreviews();
    });
}

// --- Listeners de Eventos de Navegação e Menus (Unir/Dividir/Organizar) ---

document.addEventListener('DOMContentLoaded', () => {
    // Listener para o botão Split
    if (splitBtn) {
        splitBtn.addEventListener('click', () => {
            hideAllErrors();
            if (selectedFiles.length === 0) {
                showError(' ⚠️ Por favor, selecione um arquivo para dividir.', errorMessage2);
            } else if (selectedFiles.length > 1) {
                showError(' ⚠️ Por favor, selecione apenas um arquivo para dividir.', errorMessage2);
            } else {
                openMenu(splitMenu, [compressionMenu, mergeMenu, organizeMenu, convertMenu]);
            }
        });
    }

    // Listener para o botão Merge
    if (mergeBtn) {
        mergeBtn.addEventListener('click', () => {
            hideAllErrors();
            if (selectedFiles.length < 2) {
                showError(' ⚠️ Selecione pelo menos 2 arquivos para unir.', errorMessage3);
            } else {
                openMenu(mergeMenu, [compressionMenu, splitMenu, organizeMenu, convertMenu]);
            }
        });
    }

    // Listener para o botão Organize
    if (organizeBtn) {
        organizeBtn.addEventListener('click', async () => { // Adicionado async
            hideAllErrors();
            if (fileInput) fileInput.disabled = true;
            if (dropZone) dropZone.classList.add('disabled-upload');

            if (selectedFiles.length === 0) {
                showError(' ⚠️ Por favor, selecione um arquivo para organizar.', errorMessage2);
            } else if (selectedFiles.length > 1) {
                showError(' ⚠️ Por favor, selecione um arquivo por vez para organizar.', errorMessage2);
            } else {
                if (mainButtons) mainButtons.style.display = 'none';
                if (organizeButtons) organizeButtons.style.display = 'flex';
                await generateOrganizePreviews(); // Chamar await aqui
                openMenu(organizeMenu, [compressionMenu, mergeMenu, splitMenu, convertMenu]);
                if (document.getElementById('sort-icon')) document.getElementById('sort-icon').style.display = 'none';
                if (document.getElementById('sort-menu')) document.getElementById('sort-menu').style.display = 'none';
                if (previewTitle) previewTitle.textContent = 'Organize as páginas na ordem desejada:';
            }
        });
    }

    // Listener para o botão Voltar (na função Organize)
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            resetApp();
        });
    }

    // Listener para alternar modo de divisão (parts/size)
    if (modeButtons) {
        modeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modeButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (partsOption) partsOption.style.display = 'none';
                if (sizeOption) sizeOption.style.display = 'none';

                if (btn.dataset.mode === 'parts') {
                    if (partsOption) partsOption.style.display = 'block';
                } else if (btn.dataset.mode === 'size') {
                    if (sizeOption) sizeOption.style.display = 'block';
                }
            });
        });
    }
});