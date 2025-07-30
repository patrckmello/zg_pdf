// global.js

// Variáveis globais compartilhadas
let selectedFile = null; // Usado no compress.js e em handleFiles para PDF (único arquivo)
let selectedFiles = []; // Usado em unir_dividir_organizar.js e convert.js (múltiplos arquivos)
let sortableInstance = null; // Usado em unir_dividir_organizar.js

// Constantes de elementos do DOM comuns
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('fileInput');
const errorMessage = document.getElementById('error-message');
const errorMessage2 = document.getElementById('error-message2'); // Geralmente para erros de validação
const errorMessage3 = document.getElementById('error-message3'); // Para erros específicos de merge, por exemplo

// Elementos de progresso (usados em compressão e podem ser adaptados para outros)
const progressContainer = document.getElementById('progress-container');
const statusMessage = document.getElementById('status-message');

// Referências aos menus principais (para fechar outros menus ao abrir um novo)
const compressionMenu = document.getElementById('compressionMenu');
const mergeMenu = document.getElementById('mergeMenu');
const splitMenu = document.getElementById('splitMenu');
const organizeMenu = document.getElementById('organizeMenu');
const convertMenu = document.getElementById('convertMenu');

// --- Funções Auxiliares Comuns ---

/**
 * Esconde todas as mensagens de erro.
 * @function
 */
function hideAllErrors() {
    if (errorMessage) errorMessage.style.display = 'none';
    if (errorMessage2) errorMessage2.style.display = 'none';
    if (errorMessage3) errorMessage3.style.display = 'none';
}

/**
 * Exibe uma mensagem de erro específica no elemento errorMessage2 (padrão).
 * @param {string} message - A mensagem de erro a ser exibida.
 * @param {HTMLElement} [errorElement=errorMessage2] - Opcional: elemento de erro customizado.
 */
function showError(message, errorElement = errorMessage2) {
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

/**
 * Esconde a mensagem de erro do elemento errorMessage2 (padrão).
 * @param {HTMLElement} [errorElement=errorMessage2] - Opcional: elemento de erro customizado.
 */
function hideError(errorElement = errorMessage2) {
    if (errorElement) errorElement.style.display = 'none';
}

/**
 * Exibe o spinner de carregamento.
 * @function
 */
function showSpinner() {
    document.querySelectorAll('.loading-spinner').forEach(spinner => {
        spinner.classList.remove('hidden');
    });
}

/**
 * Esconde o spinner de carregamento.
 * @function
 */
function hideSpinner() {
    document.querySelectorAll('.loading-spinner').forEach(spinner => {
        spinner.classList.add('hidden');
    });
}

/**
 * Reseta o aplicativo recarregando a página.
 * @function
 */
function resetApp() {
    location.reload();
}

/**
 * Atualiza a visibilidade do contêiner de pré-visualização de arquivos.
 * Oculta se não houver arquivos selecionados, exibe caso contrário.
 * @function
 */
function checkPreviewVisibility() {
    const containerGrid = document.getElementById('preview-container-grid');
    const pdfPreview = document.getElementById('pdf-preview-container'); // Para o compressor
    if (containerGrid && selectedFiles.length > 0) {
        containerGrid.style.display = 'block';
    } else if (containerGrid) {
        containerGrid.style.display = 'none';
    }

    // Lógica específica para o preview do compressor, que usa selectedFile
    if (pdfPreview) {
        if (selectedFile) { // Se um único arquivo PDF foi selecionado
            pdfPreview.style.display = 'block';
        } else {
            pdfPreview.style.display = 'none';
        }
    }
}

// --- Funções de Manipulação de Menus ---

/**
 * Abre um menu lateral específico e fecha outros menus.
 * @param {HTMLElement} menuToOpen - O elemento do menu a ser aberto.
 * @param {Array<HTMLElement>} [menusToClose=[]] - Opcional: Array de outros menus a serem fechados.
 */
function openMenu(menuToOpen, menusToClose = []) {
    hideAllErrors();
    // Fecha todos os menus conhecidos, exceto o que será aberto
    [compressionMenu, mergeMenu, splitMenu, organizeMenu, convertMenu].forEach(menu => {
        if (menu && menu !== menuToOpen) {
            menu.style.right = (menu.id === 'compressionMenu') ? '-500px' : '-600px';
        }
    });

    menuToOpen.style.right = '0';
}

/**
 * Fecha um menu lateral específico.
 * @param {HTMLElement} menuToClose - O elemento do menu a ser fechado.
 */
function closeMenu(menuToClose) {
    if (menuToClose) {
        menuToClose.style.right = (menuToClose.id === 'compressionMenu') ? '-500px' : '-600px';
    }
}

// --- Funções de Manipulação de Arquivos (Comuns a todos) ---

/**
 * Manipulador de arquivos genérico. Adiciona arquivos à lista global e chama uma função de preview.
 * Esta função deve ser chamada pelos event listeners do dropZone e fileInput.
 * A função `renderPreviews` é específica de cada módulo e deve ser implementada lá.
 * @param {FileList} files - A lista de arquivos.
 */
async function handleFilesUniversal(files) {
    hideAllErrors();

    // Se estiver selecionando múltiplos arquivos, não mexa em selectedFile (que é só pra compressor)
    if (files.length > 1) {
        selectedFile = null;
    } else if (files.length === 1 && files[0].type === "application/pdf" && document.getElementById("pdf-preview-container")) {
        // Caso queira manter o selectedFile para preview compressor, pode manter aqui
        selectedFile = files[0];
    } else {
        selectedFile = null;
    }

    Array.from(files).forEach(file => {
        // Adiciona só se não duplicar
        if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    });

    if (typeof renderModulePreviews === 'function') {
        await renderModulePreviews();
    }

    checkPreviewVisibility();

    if (typeof autoOpenExtractMenu === 'function') {
        autoOpenExtractMenu();
    }
}


// --- Listeners de Eventos de Upload e Drop (Comuns a todos) ---

// Listener para clique na zona de drop, que simula um clique no input de arquivo
dropZone.addEventListener('click', () => fileInput.click());

// Listener para arrastar arquivos sobre a zona de drop, muda o estilo
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = '#d7e5f5'; // Cor padrão para arrastar
});

// Listener para sair da zona de drop, restaura o estilo
dropZone.addEventListener('dragleave', () => {
    dropZone.style.backgroundColor = ''; // Restaura a cor original
});

// Listener para soltar arquivos na zona de drop, processa os arquivos
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.backgroundColor = ''; // Restaura a cor original
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFilesUniversal(files); // Usa o manipulador universal
    }
});

// Listener para mudança no input de arquivo (seleção manual), processa os arquivos
fileInput.addEventListener('change', function() {
    if (this.files.length > 0) {
        handleFilesUniversal(this.files); // Usa o manipulador universal
    }
});

// Listener para o botão de fechar genérico (se houver um único botão "X" para todos os menus)
const globalCloseBtn = document.querySelector('.close-btn');
if (globalCloseBtn) {
    globalCloseBtn.addEventListener('click', () => {
        // Fecha todos os menus abertos (ou os que você quer fechar globalmente)
        closeMenu(compressionMenu);
        closeMenu(mergeMenu);
        closeMenu(splitMenu);
        closeMenu(organizeMenu);
        closeMenu(convertMenu);
        hideAllErrors();
    });
}

// =================================================================================
// GLOBAIS
// =================================================================================

// --- CONSTS & VARS GLOBAIS ---
const previewContainer = document.getElementById('sortable-preview');
const previewTitle = document.getElementById('preview-title');
const mainButtons = document.getElementById('main-function-buttons');
const backBtn = document.getElementById('back-btn');
const PREVIEW_BATCH_SIZE = 20;

let selectedWrappers = [];
let intersectionObserver = null;
let pdfDocument = null; // Usado principalmente em Organize, mas pode ser global se reutilizado

// --- FUNÇÕES GLOBAIS ---

/**
 * Renderiza as pré-visualizações com base no contexto atual (Merge, Split ou Organize).
 * Delega a tarefa para a função apropriada.
 */
async function renderModulePreviews() {
    // Para merge/split, rebuildPreviews já faz o trabalho.
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
 * Atualiza os índices visuais das pré-visualizações.
 * Útil após reordenar ou remover itens.
 */
function updatePreviewIndices() {
    const previews = previewContainer.querySelectorAll('.preview-wrapper');
    previews.forEach((prev, newIndex) => {
        // Para previews de organização de página, o data-pageNum original é mantido.
        // Apenas para previews de arquivos (Merge/Split) o data-index é atualizado.
        if (!prev.dataset.pageNum) {
            prev.setAttribute('data-index', newIndex);
        }
    });
}

/**
 * Cria uma pré-visualização de um arquivo PDF.
 * Usado para os previews de arquivos (Merge/Split).
 * @param {File} file - O arquivo PDF.
 * @param {number} index - O índice do arquivo na lista de selectedFiles.
 * @returns {Promise<void>} Uma promessa que resolve quando a pré-visualização é criada.
 */
function createPreview(file, index) {
    return new Promise((resolve) => {
        const fileReader = new FileReader();
        fileReader.onload = async function () {
            const typedarray = new Uint8Array(this.result);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            const page = await pdf.getPage(1);
            const MAX_PREVIEW_WIDTH = 150;
            const originalViewport = page.getViewport({ scale: 1 });
            let scale = (originalViewport.width > MAX_PREVIEW_WIDTH) ? MAX_PREVIEW_WIDTH / originalViewport.width : 1;
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

            resolve(wrapper); // Agora retorna o wrapper
        };
        fileReader.readAsArrayBuffer(file);
    });
}


// --- LISTENERS GLOBAIS ---
document.addEventListener('DOMContentLoaded', () => {
    // Listener para o botão Voltar (usado principalmente na função Organize, mas pode ser global)
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            resetApp(); // A função resetApp() é assumida como global
        });
    }
});