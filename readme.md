# ZG PDF: Ferramenta de Manipulação de PDFs

Este repositório contém uma aplicação web desenvolvida em Flask para manipulação de arquivos PDF, oferecendo funcionalidades como compressão, divisão, união, organização e conversão de documentos. A ferramenta foi projetada para ser uma solução interna, facilitando o gerenciamento de documentos PDF de forma eficiente e segura.



## Funcionalidades

O ZG PDF oferece as seguintes funcionalidades:

*   **Compressão de PDF:** Reduz o tamanho de arquivos PDF, otimizando-os para diferentes usos (e.g., visualização em tela, impressão, e-mail).
*   **Divisão de PDF:** Divide um arquivo PDF em múltiplas partes, seja por número de páginas ou por tamanho de arquivo, com a opção de reparar PDFs corrompidos durante o processo.
*   **União de PDFs:** Combina múltiplos arquivos PDF em um único documento.
*   **Conversão de Arquivos para PDF:** Converte imagens (JPG, JPEG, PNG, GIF) e documentos de escritório (DOCX, XLSX, PPTX) para o formato PDF.
*   **Organização de Páginas:** Permite reorganizar as páginas de um PDF existente, incluindo a rotação de páginas individuais.
*   **Envio de Feedback:** Um formulário de contato integrado permite que os usuários enviem feedback diretamente para a equipe de TI, facilitando a comunicação e o aprimoramento da ferramenta.



## Tecnologias Utilizadas

O projeto ZG PDF é construído com as seguintes tecnologias:

*   **Backend:** Flask (Python)
*   **Processamento de PDF:**
    *   `fitz` (PyMuPDF): Para manipulação de PDFs (divisão, união, organização).
    *   `Ghostscript`: Para compressão de PDFs.
    *   `FPDF`: Para conversão de imagens para PDF.
    *   `Aspose.Slides`: Para conversão de PPTX para PDF.
    *   `LibreOffice` (via subprocesso): Para conversão de DOCX e XLSX para PDF.
*   **Outras Bibliotecas Python:**
    *   `python-dotenv`: Gerenciamento de variáveis de ambiente.
    *   `Flask-Mail`: Envio de e-mails para feedback.
    *   `Pillow` (PIL): Processamento de imagens.
    *   `werkzeug`: Utilitários para web (e.g., `secure_filename`).
*   **Frontend:** HTML, CSS, JavaScript (com jQuery para interações e AJAX).
*   **Servidor:** Desenvolvido para ser hospedado internamente (e.g., via Gunicorn/Nginx ou diretamente com o servidor de desenvolvimento do Flask para testes).



## Instalação e Uso

Para configurar e executar o ZG PDF localmente, siga os passos abaixo:

### Pré-requisitos

Certifique-se de ter os seguintes softwares instalados em seu sistema:

*   **Python 3.x**
*   **pip** (gerenciador de pacotes do Python)
*   **Ghostscript**: Necessário para a funcionalidade de compressão de PDF. Pode ser baixado em [https://www.ghostscript.com/download/gsdnld.html](https://www.ghostscript.com/download/gsdnld.html).
*   **LibreOffice**: Necessário para a conversão de arquivos DOCX e XLSX para PDF. Pode ser baixado em [https://www.libreoffice.org/download/download-libreoffice/](https://www.libreoffice.org/download/download-libreoffice/).

### Configuração

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/patrckmello/zg_pdf.git
    cd zg_pdf
    ```

2.  **Crie e ative um ambiente virtual (recomendado):**
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # No Windows, use `venv\Scripts\activate`
    ```

3.  **Instale as dependências Python:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Crie um arquivo `.env` na raiz do projeto** com as seguintes variáveis de ambiente:
    ```
    SECRET_KEY='sua_chave_secreta_aqui'
    MAIL_SERVER='seu_servidor_smtp'
    MAIL_PORT=587
    MAIL_USE_TLS=True
    MAIL_USERNAME='seu_usuario_smtp'
    MAIL_PASSWORD='sua_senha_smtp'
    MAIL_DEFAULT_SENDER_NAME='ZG PDF'
    MAIL_DEFAULT_SENDER_EMAIL='no-reply@seu-dominio.com'
    ```
    *   `SECRET_KEY`: Uma chave secreta forte para segurança da sessão do Flask.
    *   As variáveis `MAIL_` são para a funcionalidade de envio de feedback. Ajuste-as conforme seu provedor de e-mail SMTP.

### Execução

Para iniciar a aplicação, execute:

```bash
python app.py
```

O aplicativo estará disponível em `http://127.0.0.1:5000/` (ou `http://localhost:5000/`).



## Estrutura do Projeto

O repositório está organizado da seguinte forma:

*   `app.py`: O arquivo principal da aplicação Flask, contendo todas as rotas e a lógica de negócio para manipulação de PDFs e envio de feedback.
*   `templates/`: Contém os arquivos HTML (Jinja2) para as interfaces de usuário da aplicação (e.g., `main.html`, `compress.html`, `split.html`).
*   `static/`: Armazena arquivos estáticos como CSS, JavaScript e imagens, que compõem o frontend da aplicação.
*   `uploads/`: Diretório temporário para armazenar os arquivos PDF enviados pelos usuários antes do processamento.
*   `processed/`: Diretório para armazenar os arquivos PDF processados antes de serem disponibilizados para download.
*   `build/`: Contém arquivos de build ou executáveis relacionados ao projeto.
*   `dist/`: Pode conter distribuições ou pacotes do projeto.
*   `app.log`: Arquivo de log da aplicação, registrando eventos e erros.



## Contribuição

Contribuições são bem-vindas! Se você deseja contribuir com o projeto, por favor, siga estas diretrizes:

1.  Faça um fork do repositório.
2.  Crie uma nova branch para sua funcionalidade (`git checkout -b feature/minha-nova-funcionalidade`).
3.  Faça suas alterações e teste-as.
4.  Faça commit de suas alterações (`git commit -m 'Adiciona nova funcionalidade X'`).
5.  Envie para a branch original (`git push origin feature/minha-nova-funcionalidade`).
6.  Abra um Pull Request, descrevendo detalhadamente as mudanças propostas.

