import os
import uuid
import time
import subprocess
import threading
import json
import datetime
import zipfile
import math
import sys
import tempfile
import io
import json
import logging
from PIL import Image
from fpdf import FPDF
import fitz  # PyMuPDF
from dotenv import load_dotenv
from flask import Flask, render_template, request, redirect, flash, url_for, jsonify, send_file, after_this_request, g
from flask_mail import Mail, Message
from werkzeug.utils import secure_filename
import platform
import comtypes.client
from PyPDF2 import PdfReader
import comtypes
from docx.shared import Inches
from pdf2docx import Converter
import camelot

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "chave-padrao-fallback")
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

# ---------------------------- CONFIGURAÇÕES ----------------------------
app.config['MAIL_SERVER'] = os.getenv("MAIL_SERVER")
app.config['MAIL_PORT'] = int(os.getenv("MAIL_PORT", 587))
app.config['MAIL_USE_TLS'] = os.getenv("MAIL_USE_TLS", "True").lower() in ("true", "1", "yes")
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_DEFAULT_SENDER'] = (os.getenv("MAIL_DEFAULT_SENDER_NAME"), os.getenv("MAIL_DEFAULT_SENDER_EMAIL"))
mail = Mail(app)

# Diretórios
if getattr(sys, 'frozen', False):
    BASE_DIR = tempfile.gettempdir()  # PyInstaller --onefile
else:
    BASE_DIR = os.getcwd()

UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
PROCESSED_FOLDER = os.path.join(BASE_DIR, 'processed')

# Criação dos diretórios
for folder in [UPLOAD_FOLDER, PROCESSED_FOLDER]:
    os.makedirs(folder, exist_ok=True)

LOGS_FILE = 'compression_logs.json'
log_lock = threading.Lock()

# Locks e tarefas
tasks_lock = threading.Lock()
tasks = {}


logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
                    handlers=[logging.FileHandler("app.log", encoding='utf-8'), logging.StreamHandler()])


def save_compression_log(log_data):
    with log_lock:
        try:
            # Tenta abrir o arquivo existente e carregar dados
            try:
                with open(LOGS_FILE, 'r', encoding='utf-8') as f:
                    logs = json.load(f)
            except FileNotFoundError:
                logs = []

            logs.append(log_data)  # Adiciona o novo log

            with open(LOGS_FILE, 'w', encoding='utf-8') as f:
                json.dump(logs, f, indent=4, ensure_ascii=False)
        except Exception as e:
            logging.error(f"Erro ao salvar log de compressão: {e}")

def get_pdf_page_count(file_path):
    try:
        reader = PdfReader(file_path)
        return len(reader.pages)
    except Exception as e:
        logging.warning(f"Não foi possível obter número de páginas: {e}")
        return None
# ---------------------------- ROTAS DE TEMPLATES ----------------------------
@app.route('/')
def index():
    return render_template('main.html')

@app.route('/compress', methods=['GET'])
def compress_form():
    return render_template('compress.html')

@app.route('/split', methods=['GET'])
def split_form():
    return render_template('split.html')

@app.route('/convert', methods=['GET'])
def convert_form():
    return render_template('convert.html')

@app.route('/merge', methods=['GET'])
def merge_form():
    return render_template('merge.html')

@app.route('/organize', methods=['GET'])
def organize_form():
    return render_template('organize.html')

@app.route('/extract', methods=['GET'])
def extract_form():
    return render_template('extract.html')

# ---------------------------- ENVIO DE FEEDBACK ----------------------------
@app.route('/enviar-feedback', methods=['POST'])
def enviar_feedback():
    nome = request.form.get('name')
    email = request.form.get('email')
    setor = request.form.get('sector')
    mensagem = request.form.get('message')

    corpo_email_html = f"""
    <html>
    <body style="font-family: Arial, Helvetica, sans-serif; color: #444; background: #f9fafc; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); padding: 30px;">
        <h2 style="
            background: linear-gradient(90deg, #0052cc, #007bff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-weight: 700;
            font-size: 28px;
            margin-bottom: 25px;
            display: flex;
            align-items: center;
            gap: 10px;">
            📬 Novo feedback recebido
        </h2>

        <p style="font-size: 16px; margin: 10px 0;"><strong>👤 Nome:</strong> {nome}</p>
        <p style="font-size: 16px; margin: 10px 0;"><strong>📧 E-mail:</strong> {email}</p>
        <p style="font-size: 16px; margin: 10px 0;"><strong>🏢 Setor:</strong> {setor}</p>

        <p style="font-size: 16px; margin: 20px 0 10px 0;"><strong>💬 Mensagem:</strong></p>
        <p style="
            background-color: #f5f7fa;
            border-left: 5px solid #007bff;
            padding: 15px 20px;
            border-radius: 8px;
            font-size: 15px;
            white-space: pre-wrap;
            color: #333;">
            {mensagem}
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="font-size: 12px; color: #999; text-align: center; font-style: italic;">
            Enviado automaticamente pelo sistema de feedback do site.
        </p>
        </div>
    </body>
    </html>
    """

    try:
        msg = Message(subject="Feedback do Site",
                      recipients=["ti@zavagnagralha.com.br"])  # seu email para receber o feedback
        msg.body = "Você recebeu um novo feedback!"
        msg.html = corpo_email_html
        mail.send(msg)
        flash("Mensagem enviada com sucesso! Obrigado pelo seu feedback.", "success")
    except Exception as e:
        flash(f"Erro ao enviar mensagem: {e}", "error")

    return redirect(url_for('index'))


# ---------------------------- COMPRESSÃO DE PDF ----------------------------
@app.route("/compress", methods=["POST"])
def compress():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Nenhum arquivo enviado'}), 400

    compression_type = request.form.get('compression', 'screen')
    filename = secure_filename(file.filename)
    task_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_FOLDER, f"{task_id}_{filename}")
    output_path = os.path.join(PROCESSED_FOLDER, f"comprimidoZG_{filename}")
    file.save(input_path)

    with tasks_lock:
        tasks[task_id] = {
            'percent': 0,
            'status': 'Iniciando compressão...',
            'file': None, # Garante que 'file' exista desde o início
            'error': None # Para capturar erros na thread
        }


    def compress_task_thread(current_task_id, current_input_path, current_output_path, current_compression_type):
        start_time = time.time()
        logging.info(f"Thread de compressão iniciada para a tarefa: {current_task_id}")
        try:
            initial_file_size = os.path.getsize(current_input_path)
            compression_ratio = get_estimated_compression_ratio(current_compression_type)
            estimated_final_size = initial_file_size * compression_ratio
            if estimated_final_size == 0: estimated_final_size = 1

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Iniciando processo de compressão...'
                    tasks[current_task_id]['percent'] = 2 # Começa em 2% para indicar início

            process = subprocess.Popen([
                'gswin64c', '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
                f'-dPDFSETTINGS=/{current_compression_type}', '-dNOPAUSE', '-dBATCH',
                '-dQUIET', f'-sOutputFile={current_output_path}', current_input_path
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

            last_percent = 2
            while process.poll() is None:
                current_output_file_size = 0
                if os.path.exists(current_output_path):
                    current_output_file_size = os.path.getsize(current_output_path)

                if current_output_file_size > 0:
                    progress_raw = (current_output_file_size / estimated_final_size) * 100
                    percent = min(int(progress_raw), 95) # Limita o progresso em 95% até a finalização

                    # Suavização: Aumenta no máximo 5% por vez
                    if percent > last_percent + 5:
                        percent = last_percent + 5
                    last_percent = percent

                    # Atualiza o status com base no progresso
                    if percent <= 5:
                        status = "Iniciando processo de compressão..."
                    elif 5 < percent <= 15:
                        status = "Analisando estrutura do PDF e otimizando para compressão..."
                    elif 15 < percent <= 85:
                        reduction_percentage = (1 - (current_output_file_size / initial_file_size)) * 100
                        status = f"Comprimindo conteúdo... (Redução: {reduction_percentage:.1f}%)"
                    else: # 85 < percent <= 95
                        status = "Finalizando e validando o arquivo comprimido..."
                else:
                    percent = last_percent # Mantém o último progresso se o arquivo ainda não foi criado
                    status = "Analisando estrutura do PDF..."

                with tasks_lock:
                    if current_task_id in tasks:
                        tasks[current_task_id]['percent'] = percent
                        tasks[current_task_id]['status'] = status

                time.sleep(0.5)

            stdout, stderr = process.communicate()
            if process.returncode != 0:
                 raise subprocess.CalledProcessError(process.returncode, 'gswin64c', output=stdout, stderr=stderr)

            if not os.path.exists(current_output_path):
                raise FileNotFoundError(f"Arquivo de saída não foi gerado: {current_output_path}")

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['percent'] = 100
                    tasks[current_task_id]['status'] = 'Compressão concluída! Preparando para download.'
                    tasks[current_task_id]['file'] = current_output_path

            end_time = time.time()
            total_time = end_time - start_time

            input_size_mb = round(os.path.getsize(current_input_path) / (1024 * 1024), 2)
            output_size_mb = round(os.path.getsize(current_output_path) / (1024 * 1024), 2)
            num_pages = get_pdf_page_count(current_input_path)

            log_data = {
                'task_id': current_task_id,
                'input_file': os.path.basename(current_input_path),
                'output_file': os.path.basename(current_output_path),
                'compression_type': current_compression_type,
                'time_taken_seconds': round(total_time, 2),
                'pages': num_pages,
                'input_file_size_mb': input_size_mb,
                'output_file_size_mb': output_size_mb,
                'status': 'Concluído!'
            }
            save_compression_log(log_data)

        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            error_message = f"Erro no Ghostscript: {e.stderr.decode(errors='ignore') if hasattr(e, 'stderr') and e.stderr else str(e)}"
            logging.error(f"Erro na tarefa {current_task_id}: {error_message}")
            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Erro no processamento'
                    tasks[current_task_id]['error'] = error_message
                    tasks[current_task_id]['percent'] = -1
        except Exception as e:
            logging.error(f"Erro inesperado na tarefa {current_task_id}: {e}")
            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Erro interno'
                    tasks[current_task_id]['error'] = str(e)
                    tasks[current_task_id]['percent'] = -1
        finally:
            if os.path.exists(current_input_path):
                try:
                    os.remove(current_input_path)
                except OSError as e:
                    logging.warning(f"Não foi possível remover o arquivo de entrada {current_input_path}: {e}")


    # Iniciar a thread, passando explicitamente os argumentos
    thread = threading.Thread(target=compress_task_thread, args=(
        task_id, input_path, output_path, compression_type
    ))
    thread.daemon = True # Torna a thread um daemon para que ela não impeça o Flask de sair
    thread.start()

    return jsonify({'task_id': task_id})

@app.route("/progress/<task_id>")
def progress(task_id):
    # Use o lock ao ler a tarefa para garantir que o estado seja consistente
    with tasks_lock:
        task = tasks.get(task_id)

    if task:
        # Se a tarefa tiver um erro, retorne um status de erro para o frontend
        if task.get('error'):
            return jsonify(task), 500 # Ou 400, dependendo de como você quer sinalizar erros
        return jsonify(task)
    else:
        logging.warning(f"Tarefa {task_id} não encontrada para requisição de progresso.") # Adicione este log para depuração
        return jsonify({'error': 'Tarefa não encontrada'}), 404

@app.route("/download/<task_id>")
def download(task_id):
    logging.info(f"Requisição de download recebida para task_id: {task_id}")

    task = tasks.get(task_id)
    if not task:
        logging.warning(f"Download: Tarefa {task_id} não encontrada.")
        return jsonify({'error': 'Tarefa não encontrada'}), 404

    file_path = task.get('file')
    if not file_path or not os.path.exists(file_path):
        logging.error(f"Download: Arquivo '{file_path}' não encontrado.")
        return jsonify({'error': 'Arquivo não disponível'}), 404

    logging.info(f"Servindo arquivo: {file_path}")

    @after_this_request
    def cleanup(response):
        try:
            os.remove(file_path)
            logging.info(f"Arquivo {file_path} removido.")
        except Exception as e:
            logging.warning(f"Erro ao remover arquivo {file_path}: {e}")

        with tasks_lock:
            tasks.pop(task_id, None)

        return response

    return send_file(file_path, as_attachment=True)

def get_estimated_compression_ratio(compression_type):
    ratios = {
        'screen': 0.20,  # 80% de compressão
        'ebook': 0.40,   # 60% de compressão
    }
    return ratios.get(compression_type, 0.30)  # fallback seguro

COMPRESSION_LOG_FILE = 'compression_log.json'

def save_compression_log(log_data):
    # Garante que o arquivo exista e seja um JSON válido
    if not os.path.exists(COMPRESSION_LOG_FILE):
        with open(COMPRESSION_LOG_FILE, 'w') as f:
            json.dump([], f) # Inicia com uma lista vazia

    with open(COMPRESSION_LOG_FILE, 'r+') as f:
        file_data = json.load(f)
        file_data.append(log_data)
        f.seek(0) # Volta para o início do arquivo
        json.dump(file_data, f, indent=4)
        f.truncate() # Remove o conteúdo restante se o novo for menor

def get_pdf_page_count(pdf_path):
    try:
        from pypdf import PdfReader
        reader = PdfReader(pdf_path)
        return len(reader.pages)
    except Exception as e:
        logging.error(f"Erro ao obter número de páginas do PDF {pdf_path}: {e}")
        return 0 # Retorna 0 em caso de erro

# ---------------------------- CONVERSÃO DE ARQUIVOS ----------------------------
import pytesseract
import pdfplumber
import tabula
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
from docx import Document
import pandas as pd

def pdf_to_xlsx_camelot(pdf_path, output_xlsx_path):
    tables = camelot.read_pdf(pdf_path, pages='all')
    with pd.ExcelWriter(output_xlsx_path) as writer:
        for i, table in enumerate(tables):
            df = table.df
            df.to_excel(writer, sheet_name=f'Tabela_{i+1}', index=False)

def extract_text_from_pdf(input_path, lang='por'):
    text = ""

    with pdfplumber.open(input_path) as pdf:
        for page in pdf.pages:
            extracted_text = page.extract_text()
            if extracted_text and extracted_text.strip():
                text += extracted_text + "\n"
            else:
                # Faz OCR se não tiver texto extraído
                pil_image = page.to_image().original.convert('RGB')
                ocr_text = pytesseract.image_to_string(pil_image, lang=lang)
                text += ocr_text + "\n"
    return text.strip()

def is_image_textual(img, lang='por', conf_threshold=50):
    data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
    confidences = []

    for c in data['conf']:
        try:
            conf = float(c)
            if conf > 0:
                confidences.append(conf)
        except (ValueError, TypeError):
            # Ignora valores que não são numéricos
            continue

    if confidences:
        avg_conf = sum(confidences) / len(confidences)
        return avg_conf >= conf_threshold
    return False


conversion_map = {
    'pdf': ['docx', 'xlsx', 'jpeg', 'txt'],
    'docx': ['pdf', 'jpeg', 'txt'],
    'xlsx': ['pdf', 'csv'],
    'pptx': ['pdf', 'jpeg'],
    'jpg': ['pdf'],
    'jpeg':['pdf'],
    'png': ['pdf'],
}

def pdf_to_docx(input_pdf_path, output_docx_path):
    cv = Converter(input_pdf_path)
    cv.convert(output_docx_path, start=0, end=None)
    cv.close()

def pdf_to_jpeg_all(input_pdf_path):
    doc = fitz.open(input_pdf_path)
    images = []
    for page_num in range(len(doc)):
        page = doc[page_num]
        pix = page.get_pixmap()
        img_bytes = pix.tobytes("jpeg")
        images.append(img_bytes)
    doc.close()
    return images

def pdf_to_docx_hybrid(input_pdf_path, output_docx_path, lang='por'):
    docx_buffer = io.BytesIO()
    
    # 1. Converter usando pdf2docx para manter formatação
    cv = Converter(input_pdf_path)
    cv.convert(docx_buffer, start=0, end=None)
    cv.close()
    
    docx_buffer.seek(0)
    word_doc = Document(docx_buffer)
    
    # 2. Passar o OCR só onde não houver texto ou for imagem escaneada
    pdf_doc = fitz.open(input_pdf_path)

    for i, page in enumerate(pdf_doc):
        pix = page.get_pixmap()
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        if is_image_textual(img, lang=lang):
            # Já tem texto na imagem, faz OCR e adiciona no Word
            ocr_text = pytesseract.image_to_string(img, lang=lang).strip()
            if ocr_text:
                word_doc.add_page_break()
                word_doc.add_paragraph(f"[OCR - Página {i+1}]\n{ocr_text}")
        else:
            # Não faz nada, pois é imagem pura (foto, identidade, etc.)
            print(f"Página {i+1}: Imagem sem texto detectada. Ignorando OCR.")

    # 3. Salvar no arquivo final
    word_doc.save(output_docx_path)

@app.route('/convert-extensions', methods=['GET'])
def get_supported_extensions():
    extensions = list(conversion_map.keys())
    return jsonify({'extensions': extensions})

@app.route('/upload-conversion', methods=['POST'])
def upload_conversion():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400

    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower().replace('.', '')  # sem o ponto

    # Mapeamento de conversão
    available_options = conversion_map.get(ext)
    if not available_options:
        return jsonify({
            'filename': filename,
            'extension': ext,
            'message': 'Tipo de arquivo não suportado para conversão',
            'options': []
        }), 200

    # Salva o arquivo temporariamente
    task_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_FOLDER, f"{task_id}_{filename}")
    file.save(input_path)

    return jsonify({
        'filename': filename,
        'extension': ext,
        'task_id': task_id,
        'message': 'Arquivo recebido com sucesso!',
        'options': available_options
    }), 200
@app.route('/execute-conversion', methods=['POST'])
def execute_conversion():
    data = request.json
    task_id = data.get('task_id')
    target_format = data.get('target_format')

    # Busca o arquivo salvo
    file_match = None
    for f in os.listdir(UPLOAD_FOLDER):
        if f.startswith(task_id):
            file_match = f
            break

    if not file_match:
        return jsonify({'error': 'Arquivo temporário não encontrado.'}), 404

    input_path = os.path.join(UPLOAD_FOLDER, file_match)
    ext = os.path.splitext(file_match)[1].lower().replace('.', '')

    try:
        output_buffer = io.BytesIO()

        if ext == 'pdf':
            # Extrai o texto para casos txt e xlsx
            text = extract_text_from_pdf(input_path)

            if target_format == 'docx':
                temp_docx_path = os.path.join(PROCESSED_FOLDER, f"{task_id}.docx")
                pdf_to_docx_hybrid(input_path, temp_docx_path)  # usa input_path aqui!

                with open(temp_docx_path, 'rb') as f:
                    output_buffer.write(f.read())
                output_buffer.seek(0)
                os.remove(temp_docx_path)

            elif target_format == 'xlsx':
                text = extract_text_from_pdf(input_path)
                lines = text.strip().split("\n")

                df_list = []
                # 1º Tenta com Camelot lattice (pra PDF com linhas marcadas)
                tables = camelot.read_pdf(input_path, pages='all', flavor='lattice')
                
                if tables.n == 0:
                    # Se não achou tabela com lattice, tenta stream (análise por espaçamento)
                    tables = camelot.read_pdf(input_path, pages='all', flavor='stream')
                
                if tables.n == 0:
                    # Se mesmo assim não achar, faz fallback pra texto puro na aba
                    df_list.append(pd.DataFrame({'Conteúdo': lines}))
                else:
                    for tbl in tables:
                        df = tbl.df.copy()
                        # Limpeza de células (remove \n e espaços bugados)
                        df = df.applymap(lambda x: ' '.join(str(x).split()))
                        df_list.append(df)
                
                # Monta Excel com múltiplas abas
                with pd.ExcelWriter(output_buffer, engine='xlsxwriter') as writer:
                    for idx, df in enumerate(df_list):
                        df.to_excel(writer, sheet_name=f'Tabela_{idx+1}'[:31], index=False)
                    # Aba adicional com texto linear completo
                    pd.DataFrame({'Texto extraído': lines}).to_excel(writer, sheet_name='Texto_RAW', index=False)
                output_buffer.seek(0)


            elif target_format == 'jpeg':
                images = pdf_to_jpeg_all(input_path)
                filename = os.path.splitext(file_match)[0]
                with zipfile.ZipFile(output_buffer, mode='w') as zf:
                    for i, img_bytes in enumerate(images, 1):
                        zf.writestr(f"{filename}_page_{i}.jpeg", img_bytes)
                output_buffer.seek(0)
                return send_file(output_buffer, as_attachment=True, download_name=f"{filename}_pages.zip")

            elif target_format == 'txt':
                output_buffer.write(text.encode('utf-8'))
                output_buffer.seek(0)

            else:
                return jsonify({'error': 'Conversão não suportada para PDF.'}), 400

        elif ext in ['docx', 'xlsx', 'pptx']:
            if target_format == 'pdf':
                pdf_path = convert_office_to_pdf(input_path)
                with open(pdf_path, 'rb') as f:
                    output_buffer.write(f.read())
                output_buffer.seek(0)
                os.remove(pdf_path)
            elif target_format == 'image':
                return jsonify({'error': 'Conversão Office → Imagem não implementada ainda.'}), 501
            elif target_format == 'txt' and ext == 'docx':
                import docx
                doc = docx.Document(input_path)
                fullText = '\n'.join([p.text for p in doc.paragraphs])
                output_buffer.write(fullText.encode('utf-8'))
                output_buffer.seek(0)
            else:
                return jsonify({'error': 'Conversão não suportada.'}), 400

        elif ext in ['jpg', 'jpeg', 'png']:
            if target_format == 'pdf':
                image = Image.open(input_path).convert('RGB')
                pdf = FPDF()
                pdf.add_page()
                temp_path = os.path.join(UPLOAD_FOLDER, 'temp_image.jpg')
                image.save(temp_path)
                pdf.image(temp_path, x=10, y=10, w=180)
                os.remove(temp_path)
                output_buffer.write(pdf.output(dest='S').encode('latin1'))
                output_buffer.seek(0)
            else:
                return jsonify({'error': 'Conversão não suportada para imagem.'}), 400

        else:
            return jsonify({'error': 'Formato de entrada não reconhecido.'}), 400

        # Limpeza do arquivo temporário
        os.remove(input_path)

        # Retorno do arquivo convertido
        return send_file(output_buffer, as_attachment=True, download_name=f'convertido.{target_format}')

    except Exception as e:
        logging.error(f"Erro na conversão: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/conversion-options/<file_ext>', methods=['GET'])
def get_conversion_options(file_ext):
    file_ext = file_ext.lower()
    options = conversion_map.get(file_ext)
    if options is None:
        return jsonify({'options': []})
    return jsonify({'options': options})

@app.before_request
def init_com_for_request():
    comtypes.CoInitialize()
    g.com_initialized = True

@app.teardown_request
def uninit_com_for_request(exception):
    if getattr(g, 'com_initialized', False):
        comtypes.CoUninitialize()

def convert_office_to_pdf_libreoffice(input_path):
    subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir',
                    os.path.dirname(input_path), input_path],
                   check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return os.path.splitext(input_path)[0] + '.pdf'

def convert_office_to_pdf_windows(input_path, timeout=30):
    ext = os.path.splitext(input_path)[1].lower()
    abs_input = os.path.abspath(input_path)
    abs_output = os.path.splitext(abs_input)[0] + '.pdf'

    def convert():
        if ext == '.docx':
            word = comtypes.client.CreateObject('Word.Application')
            word.Visible = False
            try:
                doc = word.Documents.Open(abs_input, ReadOnly=True)
                doc.ExportAsFixedFormat(abs_output, ExportFormat=17)
            finally:
                doc.Close(False)
                word.Quit()

        elif ext == '.xlsx':
            excel = comtypes.client.CreateObject('Excel.Application')
            excel.Visible = False
            excel.DisplayAlerts = False
            try:
                wb = excel.Workbooks.Open(abs_input, UpdateLinks=0, ReadOnly=True)
                wb.ExportAsFixedFormat(0, abs_output)
            finally:
                wb.Close(False)
                excel.Quit()

        elif ext == '.pptx':
            powerpoint = comtypes.client.CreateObject('PowerPoint.Application')
            try:
                pres = powerpoint.Presentations.Open(abs_input, WithWindow=False)
                pres.ExportAsFixedFormat(abs_output, 2)
            finally:
                pres.Close()
                powerpoint.Quit()
        else:
            raise ValueError(f"Extensão não suportada pelo Office: {ext}")

    thread = threading.Thread(target=convert)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        raise TimeoutError("Conversão demorou demais e foi abortada.")
    return abs_output

def convert_office_to_pdf(input_path):
    if platform.system() == 'Windows':
        return convert_office_to_pdf_windows(input_path)
    else:
        return convert_office_to_pdf_libreoffice(input_path)

# ---------------------------- UNIR / DIVIDIR / ORGANIZAR PDFs ----------------------------
@app.route('/merge', methods=['POST'])
def merge_pdfs():
    files = request.files.getlist('files')
    merged_pdf = fitz.open()
    for f in files:
        doc = fitz.open(stream=f.read(), filetype='pdf')
        merged_pdf.insert_pdf(doc)
    buffer = io.BytesIO()
    merged_pdf.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='unido.pdf')

# Garanta que estes imports estejam no topo do seu arquivo app.py
import io
import math
import zipfile
import fitz  # PyMuPDF
from flask import request, send_file, jsonify
from datetime import datetime # <--- ESTA É A LINHA DA CORREÇÃO!

# ... (seu código da app Flask e outras rotas) ...

@app.route('/split', methods=['POST'])
def split_pdfs():
    print(f"[{datetime.now()}] REQUISIÇÃO /split recebida.")
    
    if 'pdfs' not in request.files:
        return jsonify({"message": "Nenhum arquivo enviado."}), 400

    f = request.files.getlist('pdfs')[0]
    mode = request.form.get('mode')
    
    # --- MUDANÇA #1: LÓGICA DE REPARO OPCIONAL ---
    # Verifica se o frontend enviou a flag para reparar o PDF
    repair_needed = request.form.get('repair_pdf') == 'true'
    
    try:
        pdf_bytes = f.read()

        if repair_needed:
            print(f"[{datetime.now()}] Reparo solicitado. Iniciando limpeza do PDF em memória...")
            # Abre o PDF original
            original_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            # Cria um buffer em memória para salvar a versão reparada
            repaired_buffer = io.BytesIO()
            # Salva no buffer com a opção 'clean=True', que repara a estrutura do PDF
            original_doc.save(repaired_buffer, garbage=4, deflate=True, clean=True)
            original_doc.close()
            # O 'pdf_bytes' agora será o do PDF reparado para o resto da função
            pdf_bytes = repaired_buffer.getvalue()
            print(f"[{datetime.now()}] PDF reparado com sucesso.")

        # O resto da função continua igual, mas usando 'pdf_bytes' (que pode ter sido reparado)
        pdf_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        print(f"[{datetime.now()}] PDF aberto com sucesso. {pdf_doc.page_count} páginas.")
    except Exception as e:
        print(f"[{datetime.now()}] Erro ao abrir ou reparar PDF: {e}")
        return jsonify({"message": f"Arquivo PDF inválido ou corrompido demais para reparar: {e}"}), 400
    # ----------------------------------------------------
        
    filename = f.filename.rsplit('.', 1)[0]
    zip_buffer = io.BytesIO()

    # O resto da sua função continua exatamente como estava antes
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        if mode == 'parts':
            # ... (código do modo 'parts' sem alterações) ...
            try:
                parts = int(request.form.get('parts'))
                if parts <= 0: return jsonify({"message": "O número de partes deve ser maior que 0."}), 400
                if parts > pdf_doc.page_count: return jsonify({"message": f"O número de partes ({parts}) não pode ser maior que o número de páginas ({pdf_doc.page_count})."}), 400
            except (ValueError, TypeError): return jsonify({"message": "Número de partes inválido."}), 400

            pages_per_part = math.ceil(pdf_doc.page_count / parts)
            for i in range(parts):
                start_page = i * pages_per_part
                end_page = min(start_page + pages_per_part - 1, pdf_doc.page_count - 1)
                if start_page > end_page: continue
                new_pdf = fitz.open()
                new_pdf.insert_pdf(pdf_doc, from_page=start_page, to_page=end_page)
                output_buffer = io.BytesIO()
                new_pdf.save(output_buffer, garbage=4, deflate=True) 
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{i+1}_de_{parts}.pdf", output_buffer.read())
                new_pdf.close()

        elif mode == 'size':
            # ... (código do modo 'size' com busca binária sem alterações) ...
            try:
                max_size_mb = float(request.form.get('max_size_mb'))
                if max_size_mb <= 0: return jsonify({"message": "O tamanho máximo deve ser maior que 0 MB."}), 400
            except (ValueError, TypeError): return jsonify({"message": "Tamanho máximo inválido."}), 400

            max_size_bytes = max_size_mb * 1024 * 1024
            part_number = 1
            chunk_start_page = 0
            
            print(f"[{datetime.now()}] Iniciando divisão por tamanho com BUSCA BINÁRIA. Limite: {max_size_mb}MB.")

            while chunk_start_page < pdf_doc.page_count:
                print(f"[{datetime.now()}] ===== Processando Bloco #{part_number} (começando da pág. {chunk_start_page + 1}) =====")
                
                single_page_doc = fitz.open()
                single_page_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=chunk_start_page)
                single_page_buffer = io.BytesIO()
                single_page_doc.save(single_page_buffer)
                if single_page_buffer.tell() > max_size_bytes:
                     print(f"[{datetime.now()}] ERRO: Página única maior que o limite.")
                     return jsonify({"message": f"A página {chunk_start_page + 1} sozinha ({single_page_buffer.tell() / (1024*1024):.2f}MB) já é maior que o limite de {max_size_mb} MB."}), 400
                
                low = chunk_start_page
                high = pdf_doc.page_count - 1
                best_end_page = chunk_start_page

                while low <= high:
                    mid = (low + high) // 2
                    test_doc = fitz.open()
                    test_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=mid)
                    test_buffer = io.BytesIO()
                    test_doc.save(test_buffer)
                    test_doc.close()
                    
                    if test_buffer.tell() <= max_size_bytes:
                        best_end_page = mid
                        low = mid + 1
                    else:
                        high = mid - 1
                
                chunk_end_page = best_end_page
                print(f"[{datetime.now()}] Bloco #{part_number} definido via busca: páginas {chunk_start_page + 1} a {chunk_end_page + 1}. Criando PDF final...")

                final_chunk_doc = fitz.open()
                final_chunk_doc.insert_pdf(pdf_doc, from_page=chunk_start_page, to_page=chunk_end_page)
                output_buffer = io.BytesIO()
                final_chunk_doc.save(output_buffer, garbage=4, deflate=True)
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{part_number}.pdf", output_buffer.read())
                
                print(f"[{datetime.now()}] Bloco #{part_number} salvo no ZIP. Total de {final_chunk_doc.page_count} páginas.")
                
                final_chunk_doc.close()
                part_number += 1
                chunk_start_page = chunk_end_page + 1
                
    pdf_doc.close()
    zip_buffer.seek(0)
    
    print(f"[{datetime.now()}] Processo finalizado. Enviando ZIP para o cliente.")
    return send_file(zip_buffer, as_attachment=True, download_name=f'{filename}_dividido.zip', mimetype='application/zip')


@app.route('/organize', methods=['POST'])
def organize_pdf():
    file = request.files.get('pdf')
    new_order = json.loads(request.form.get('order'))
    pdf_doc = fitz.open(stream=file.read(), filetype='pdf')
    new_doc = fitz.open()
    for item in new_order:
        page = pdf_doc[item['page'] - 1]
        page.set_rotation(item.get('rotation', 0))
        new_doc.insert_pdf(pdf_doc, from_page=item['page'] - 1, to_page=item['page'] - 1)
    buffer = io.BytesIO()
    new_doc.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='organized.pdf')

@app.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5009)
