import os
import sys
import io
import json
import time
import math
import zipfile
import tempfile
import logging
import threading
import subprocess
import platform
import uuid
from datetime import datetime
import shutil


from dotenv import load_dotenv
from flask import (
    Flask, render_template, request, redirect, flash, url_for,
    jsonify, send_file, after_this_request, g
)
from flask_mail import Mail, Message
from werkzeug.utils import secure_filename

import fitz  # PyMuPDF
from PIL import Image
from fpdf import FPDF
from pdf2docx import Converter
import pdfplumber
import pytesseract
import camelot
import pandas as pd

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "chave-padrao-fallback")
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024

# ---------------------------- CONFIG ----------------------------
app.config['MAIL_SERVER'] = os.getenv("MAIL_SERVER")
app.config['MAIL_PORT'] = int(os.getenv("MAIL_PORT", 587))
app.config['MAIL_USE_TLS'] = os.getenv("MAIL_USE_TLS", "True").lower() in ("true", "1", "yes")
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_DEFAULT_SENDER'] = (os.getenv("MAIL_DEFAULT_SENDER_NAME"), os.getenv("MAIL_DEFAULT_SENDER_EMAIL"))
mail = Mail(app)

# Diretórios
BASE_DIR = tempfile.gettempdir() if getattr(sys, 'frozen', False) else os.getcwd()
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
PROCESSED_FOLDER = os.path.join(BASE_DIR, 'processed')
for folder in [UPLOAD_FOLDER, PROCESSED_FOLDER]:
    os.makedirs(folder, exist_ok=True)

# Logs / tasks
COMPRESSION_LOG_FILE = 'compression_log.json'
log_lock = threading.Lock()
tasks_lock = threading.Lock()
tasks = {}

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s in %(module)s: %(message)s',
    handlers=[logging.FileHandler("app.log", encoding='utf-8'), logging.StreamHandler()]
)

# Ajuste Ghostscript por SO
GS_CMD = "gswin64c" if platform.system() == "Windows" else "gs"

# Pytesseract: sem caminho fixo no Linux
if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


# ---------------------------- Utils ----------------------------
def save_compression_log(log_data: dict) -> None:
    """Append seguro em JSON (cria se não existir)."""
    with log_lock:
        if not os.path.exists(COMPRESSION_LOG_FILE):
            with open(COMPRESSION_LOG_FILE, 'w', encoding='utf-8') as f:
                json.dump([], f, ensure_ascii=False)
        with open(COMPRESSION_LOG_FILE, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            data.append(log_data)
            f.seek(0)
            json.dump(data, f, indent=4, ensure_ascii=False)
            f.truncate()


def get_pdf_page_count(pdf_path: str) -> int:
    """Conta páginas com pypdf (robusto)."""
    try:
        from pypdf import PdfReader
        return len(PdfReader(pdf_path).pages)
    except Exception as e:
        logging.error(f"Erro ao obter número de páginas do PDF {pdf_path}: {e}")
        return 0


def get_estimated_compression_ratio(compression_type: str) -> float:
    ratios = {
        'screen': 0.20,  # ~80% de compressão
        'ebook': 0.40,   # ~60% de compressão
    }
    return ratios.get(compression_type, 0.30)


# ---------------------------- Templates ----------------------------
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


# ---------------------------- Feedback ----------------------------
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
        <h2 style="-webkit-background-clip:text;-webkit-text-fill-color:transparent;background:linear-gradient(90deg,#0052cc,#007bff);font-weight:700;font-size:28px;margin-bottom:25px;display:flex;align-items:center;gap:10px;">📬 Novo feedback recebido</h2>
        <p><strong>👤 Nome:</strong> {nome}</p>
        <p><strong>📧 E-mail:</strong> {email}</p>
        <p><strong>🏢 Setor:</strong> {setor}</p>
        <p><strong>💬 Mensagem:</strong></p>
        <p style="background:#f5f7fa;border-left:5px solid #007bff;padding:15px 20px;border-radius:8px;white-space:pre-wrap;color:#333;">{mensagem}</p>
        <hr style="border:none;border-top:1px solid #ddd;margin:30px 0;">
        <p style="font-size:12px;color:#999;text-align:center;font-style:italic;">Enviado automaticamente pelo sistema de feedback do site.</p>
      </div>
    </body>
    </html>
    """

    try:
        msg = Message(subject="Feedback do Site", recipients=["ti@zavagnagralha.com.br"])
        msg.body = "Você recebeu um novo feedback!"
        msg.html = corpo_email_html
        mail.send(msg)
        flash("Mensagem enviada com sucesso! Obrigado pelo seu feedback.", "success")
        return '', 200
    except Exception as e:
        flash(f"Erro ao enviar mensagem: {e}", "error")
        return str(e), 500


# ---------------------------- Compressão ----------------------------
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
        tasks[task_id] = {'percent': 0, 'status': 'Iniciando compressão...', 'file': None, 'error': None}

    def compress_task_thread(current_task_id, current_input_path, current_output_path, current_compression_type):
        start_time = time.time()
        logging.info(f"Thread de compressão iniciada para a tarefa: {current_task_id}")
        try:
            initial_file_size = os.path.getsize(current_input_path)
            compression_ratio = get_estimated_compression_ratio(current_compression_type)
            estimated_final_size = max(int(initial_file_size * compression_ratio), 1)

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['status'] = 'Iniciando processo de compressão...'
                    tasks[current_task_id]['percent'] = 2

            def run_gs_compat(cmd_output_path, compression_type_override, extra_flags=None):
                # usa a variável current_input_path do escopo da thread
                return run_gs(current_input_path, cmd_output_path, compression_type_override, extra_flags)

            def run_gs(current_input_path, cmd_output_path, compression_type_override, extra_flags=None):
                gs_path = shutil.which("gs") or "/usr/bin/gs"
                if not os.path.exists(gs_path):
                    raise FileNotFoundError(f"Ghostscript não encontrado em PATH, tente instalar ou definir o caminho, procurado: {gs_path}")

                command = [
                    gs_path,
                    "-sDEVICE=pdfwrite",
                    "-dCompatibilityLevel=1.4",
                    f"-dPDFSETTINGS=/{compression_type_override}",
                    "-dNOPAUSE",
                    "-dBATCH",
                    "-dQUIET",
                    f"-sOutputFile={cmd_output_path}",
                    current_input_path,
                ]
                if extra_flags:
                    command += extra_flags

                # retorna Popen para funcionar com poll() e communicate()
                return subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

            process = run_gs_compat(current_output_path, current_compression_type)
            last_percent = 2
            while process.poll() is None:
                current_output_file_size = os.path.getsize(current_output_path) if os.path.exists(current_output_path) else 0
                if current_output_file_size > 0:
                    progress_raw = (current_output_file_size / estimated_final_size) * 100
                    percent = min(int(progress_raw), 95)
                    if percent > last_percent + 5:
                        percent = last_percent + 5
                    last_percent = percent

                    if percent <= 5:
                        status = "Iniciando processo de compressão..."
                    elif 5 < percent <= 15:
                        status = "Analisando estrutura do PDF e otimizando..."
                    elif 15 < percent <= 85:
                        reduction_percentage = (1 - (current_output_file_size / initial_file_size)) * 100
                        status = f"Comprimindo... (Redução: {reduction_percentage:.1f}%)"
                    else:
                        status = "Finalizando e validando..."
                else:
                    percent = last_percent
                    status = "Analisando estrutura do PDF..."

                with tasks_lock:
                    if current_task_id in tasks:
                        tasks[current_task_id]['percent'] = percent
                        tasks[current_task_id]['status'] = status

                time.sleep(0.5)

            stdout, stderr = process.communicate()
            if process.returncode != 0:
                raise subprocess.CalledProcessError(process.returncode, process.args, output=stdout, stderr=stderr)

            if not os.path.exists(current_output_path):
                raise FileNotFoundError(f"Arquivo de saída não foi gerado: {current_output_path}")

            final_file_size = os.path.getsize(current_output_path)
            if final_file_size >= initial_file_size:
                logging.warning("Compressão ineficaz. Tentando fallback agressivo.")
                fallback_path = current_output_path.replace('.pdf', '_fallback.pdf')
                aggressive_flags = [
                    '-dDownsampleColorImages=true', '-dColorImageResolution=72', '-dAutoFilterColorImages=false', '-dColorImageFilter=/DCTEncode',
                    '-dGrayImageResolution=72', '-dDownsampleGrayImages=true', '-dAutoFilterGrayImages=false', '-dGrayImageFilter=/DCTEncode',
                    '-dMonoImageResolution=72', '-dDownsampleMonoImages=true'
                ]
                fallback_process = run_gs_compat(fallback_path, "screen", aggressive_flags)
                fallback_process.communicate()

                if os.path.exists(fallback_path):
                    fallback_size = os.path.getsize(fallback_path)
                    if fallback_size < initial_file_size:
                        os.replace(fallback_path, current_output_path)
                    else:
                        os.replace(current_input_path, current_output_path)
                        try:
                            os.remove(fallback_path)
                        except Exception:
                            pass
                else:
                    os.replace(current_input_path, current_output_path)

            with tasks_lock:
                if current_task_id in tasks:
                    tasks[current_task_id]['percent'] = 100
                    tasks[current_task_id]['status'] = 'Compressão concluída! Preparando download...'
                    tasks[current_task_id]['file'] = current_output_path

            end_time = time.time()
            log_data = {
                'task_id': current_task_id,
                'input_file': os.path.basename(current_input_path),
                'output_file': os.path.basename(current_output_path),
                'compression_type': current_compression_type,
                'time_taken_seconds': round(end_time - start_time, 2),
                'pages': get_pdf_page_count(current_output_path),
                'input_file_size_mb': round(initial_file_size / (1024 * 1024), 2),
                'output_file_size_mb': round(os.path.getsize(current_output_path) / (1024 * 1024), 2),
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

    thread = threading.Thread(target=compress_task_thread, args=(task_id, input_path, output_path, compression_type))
    thread.daemon = True
    thread.start()

    return jsonify({'task_id': task_id})


@app.route("/progress/<task_id>")
def progress(task_id):
    with tasks_lock:
        task = tasks.get(task_id)
    if task:
        if task.get('error'):
            return jsonify(task), 500
        return jsonify(task)
    logging.warning(f"Tarefa {task_id} não encontrada para progresso.")
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


# ---------------------------- Conversão ----------------------------
def extract_text_from_pdf(input_path, lang='por'):
    text = ""
    with pdfplumber.open(input_path) as pdf:
        for page in pdf.pages:
            extracted_text = page.extract_text()
            if extracted_text and extracted_text.strip():
                text += extracted_text + "\n"
            else:
                # OCR fallback
                pil_image = page.to_image().original.convert('RGB')
                ocr_text = pytesseract.image_to_string(pil_image, lang=lang)
                text += ocr_text + "\n"
    return text.strip()


def is_pdf_scanned(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        total_text = ""
        for page in pdf.pages:
            t = page.extract_text()
            if t and t.strip():
                total_text += t.strip()
        return len(total_text) < 200


def pdf_to_docx(input_pdf_path, output_docx_path, lang='por', conf_threshold=50):
    # 1) PDF -> DOCX (layout)
    docx_buffer = io.BytesIO()
    cv = Converter(input_pdf_path)
    cv.convert(docx_buffer, start=0, end=None)
    cv.close()
    docx_buffer.seek(0)

    from docx import Document
    word_doc = Document(docx_buffer)

    # 2) OCR por página se necessário
    pdf_doc = fitz.open(input_pdf_path)

    def is_image_textual(img, lang=lang, conf_threshold=conf_threshold):
        data = pytesseract.image_to_data(img, lang=lang, output_type=pytesseract.Output.DICT)
        confs = []
        for c in data['conf']:
            try:
                v = float(c)
                if v > 0:
                    confs.append(v)
            except Exception:
                pass
        if confs:
            return (sum(confs) / len(confs)) >= conf_threshold
        return False

    for i, page in enumerate(pdf_doc):
        text_in_page = page.get_text().strip()
        pix = page.get_pixmap()
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        if not text_in_page and is_image_textual(img, lang=lang):
            ocr_text = pytesseract.image_to_string(img, lang=lang).strip()
            if i < len(word_doc.paragraphs):
                p = word_doc.paragraphs[i]
                # Limpeza simples: remove runs e substitui
                for r in p.runs:
                    r.text = ""
                p.add_run(ocr_text)
            else:
                word_doc.add_paragraph(ocr_text)

    word_doc.save(output_docx_path)


conversion_map = {
    'pdf': ['docx', 'xlsx', 'txt'],
    'docx': ['pdf', 'txt'],
    'xlsx': ['pdf'],
    'pptx': ['pdf'],
    'jpg': ['pdf'],
    'jpeg': ['pdf'],
    'png': ['pdf'],
}


@app.route('/convert-extensions', methods=['GET'])
def get_supported_extensions():
    return jsonify({'extensions': list(conversion_map.keys())})


@app.route('/upload-conversion', methods=['POST'])
def upload_conversion():
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'Nenhum arquivo enviado.'}), 400

    filename = secure_filename(file.filename)
    ext = os.path.splitext(filename)[1].lower().replace('.', '')
    available_options = conversion_map.get(ext)

    if not available_options:
        return jsonify({
            'filename': filename,
            'extension': ext,
            'message': 'Tipo de arquivo não suportado para conversão',
            'options': []
        }), 200

    task_id = str(uuid.uuid4())
    input_path = os.path.join(UPLOAD_FOLDER, f"{task_id}_{filename}")
    file.save(input_path)

    is_scanned = is_pdf_scanned(input_path) if ext == 'pdf' else False

    return jsonify({
        'filename': filename,
        'extension': ext,
        'task_id': task_id,
        'message': 'Arquivo recebido com sucesso!',
        'options': available_options,
        'is_scanned': is_scanned
    }), 200


def _find_soffice():
    candidates = [
        shutil.which("soffice"),
        "/usr/bin/soffice",
        "/usr/lib/libreoffice/program/soffice",
        shutil.which("libreoffice"),   # snap costuma expor esse
        "/snap/bin/libreoffice",
    ]
    for p in candidates:
        if p and os.path.exists(p):
            return p
    return None

def convert_office_to_pdf_libreoffice(input_path):
    """Office -> PDF via LibreOffice (Linux)."""
    soffice = _find_soffice()
    if not soffice:
        raise FileNotFoundError(
            "LibreOffice não encontrado. Instale 'libreoffice' e/ou ajuste PATH. "
            "Procurei por: soffice/libreoffice em /usr/bin, /usr/lib/libreoffice, /snap/bin."
        )
    # Usa 'libreoffice' se for o que achou
    cmd = [soffice, '--headless', '--convert-to', 'pdf', '--outdir',
           os.path.dirname(input_path), input_path]
    try:
        res = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    except FileNotFoundError as e:
        raise FileNotFoundError(f"Executável não encontrado: {soffice}") from e
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"Falha na conversão LO. stdout:\n{e.stdout}\nstderr:\n{e.stderr}") from e
    return os.path.splitext(input_path)[0] + '.pdf'


def convert_office_to_pdf(input_path):
    """Despacha por SO. No Linux usa LibreOffice, no Windows tu pode plugar automação Office se quiser (removido aqui)."""
    if platform.system() == 'Windows':
        raise RuntimeError("Conversão Office->PDF no Windows não está habilitada nesta build.")
    return convert_office_to_pdf_libreoffice(input_path)


@app.route('/execute-conversion', methods=['POST'])
def execute_conversion():
    data = request.json
    task_id = data.get('task_id')
    target_format = data.get('target_format')

    file_match = None
    for f in os.listdir(UPLOAD_FOLDER):
        if f.startswith(task_id):
            file_match = f
            break
    if not file_match:
        return jsonify({'error': 'Arquivo temporário não encontrado.'}), 404

    input_path = os.path.join(UPLOAD_FOLDER, file_match)
    ext = os.path.splitext(file_match)[1].lower().replace('.', '')
    temp_files_to_delete = []

    try:
        output_buffer = io.BytesIO()

        if ext == 'pdf':
            text = extract_text_from_pdf(input_path)

            if target_format == 'docx':
                temp_docx_path = os.path.join(PROCESSED_FOLDER, f"{task_id}.docx")
                pdf_to_docx(input_path, temp_docx_path)
                temp_files_to_delete.append(temp_docx_path)
                temp_files_to_delete.append(input_path)
                with open(temp_docx_path, 'rb') as f:
                    output_buffer.write(f.read())
                output_buffer.seek(0)

            elif target_format == 'xlsx':
                lines = text.strip().split("\n")
                df_list = []
                tables = camelot.read_pdf(input_path, pages='all', flavor='lattice')
                if tables.n == 0:
                    tables = camelot.read_pdf(input_path, pages='all', flavor='stream')
                if tables.n == 0:
                    df_list.append(pd.DataFrame({'Conteúdo': lines}))
                else:
                    for tbl in tables:
                        df = tbl.df.copy()
                        df = df.applymap(lambda x: ' '.join(str(x).split()))
                        df_list.append(df)
                with pd.ExcelWriter(output_buffer, engine='xlsxwriter') as writer:
                    for idx, df in enumerate(df_list):
                        df.to_excel(writer, sheet_name=f'Tabela_{idx+1}'[:31], index=False)
                    pd.DataFrame({'Texto extraído': lines}).to_excel(writer, sheet_name='Texto_RAW', index=False)
                output_buffer.seek(0)

            elif target_format == 'txt':
                output_buffer.write(text.encode('utf-8'))
                output_buffer.seek(0)

            else:
                return jsonify({'error': 'Conversão não suportada para PDF.'}), 400

        elif ext in ['docx', 'xlsx', 'pptx']:
            if target_format == 'pdf':
                pdf_path = convert_office_to_pdf(input_path)
                temp_files_to_delete.append(pdf_path)
                with open(pdf_path, 'rb') as f:
                    output_buffer.write(f.read())
                output_buffer.seek(0)
                os.remove(pdf_path)
            elif target_format == 'image':
                return jsonify({'error': 'Conversão Office → Imagem não implementada.'}), 501
            elif target_format == 'txt' and ext == 'docx':
                import docx
                doc = docx.Document(input_path)
                full_text = '\n'.join([p.text for p in doc.paragraphs])
                output_buffer.write(full_text.encode('utf-8'))
                output_buffer.seek(0)
            else:
                return jsonify({'error': 'Conversão não suportada.'}), 400

        elif ext in ['jpg', 'jpeg', 'png']:
            if target_format == 'pdf':
                image = Image.open(input_path).convert('RGB')
                img_w_px, img_h_px = image.size

                if img_w_px >= img_h_px:
                    orientation = 'L'; page_w_mm, page_h_mm = 297, 210
                else:
                    orientation = 'P'; page_w_mm, page_h_mm = 210, 297

                margin_mm = 10
                max_w_mm = page_w_mm - 2 * margin_mm
                max_h_mm = page_h_mm - 2 * margin_mm

                scale_w = max_w_mm / img_w_px
                scale_h = max_h_mm / img_h_px
                scale = min(scale_w, scale_h)

                disp_w_mm = img_w_px * scale
                disp_h_mm = img_h_px * scale
                x_mm = (page_w_mm - disp_w_mm) / 2.0
                y_mm = (page_h_mm - disp_h_mm) / 2.0

                pdf = FPDF(orientation=orientation, unit='mm', format='A4')
                pdf.set_auto_page_break(False)
                pdf.add_page()

                with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp:
                    temp_path = tmp.name
                image.save(temp_path, 'JPEG', quality=95)

                pdf.image(temp_path, x=x_mm, y=y_mm, w=disp_w_mm, h=disp_h_mm)

                try:
                    os.remove(temp_path)
                except Exception:
                    pass

                pdf_data = pdf.output(dest='S')

                # FPDF 1.x → str | FPDF2 → bytes/bytearray
                if isinstance(pdf_data, str):
                    pdf_data = pdf_data.encode('latin1')

                output_buffer.write(pdf_data)
                output_buffer.seek(0)

            else:
                return jsonify({'error': 'Conversão não suportada para imagem.'}), 400

        else:
            return jsonify({'error': 'Formato de entrada não reconhecido.'}), 400

        # Limpa upload temporário
        try:
            os.remove(input_path)
        except Exception:
            pass

        return send_file(output_buffer, as_attachment=True, download_name=f'convertido.{target_format}')

    except Exception as e:
        logging.error(f"Erro na conversão: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(input_path):
            try:
                os.remove(input_path)
            except Exception as e:
                logging.warning(f"Erro removendo arquivo original: {input_path} - {e}")
        for temp_file in temp_files_to_delete:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception as e:
                    logging.warning(f"Erro removendo arquivo temporário: {temp_file} - {e}")


# ---------------------------- Merge / Split / Organize ----------------------------
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


@app.route('/split', methods=['POST'])
def split_pdfs():
    print(f"[{datetime.now()}] REQUISIÇÃO /split recebida.")

    if 'pdfs' not in request.files:
        return jsonify({"message": "Nenhum arquivo enviado."}), 400

    f = request.files.getlist('pdfs')[0]
    mode = request.form.get('mode')

    repair_needed = request.form.get('repair_pdf') == 'true'

    try:
        pdf_bytes = f.read()

        if repair_needed:
            print(f"[{datetime.now()}] Reparo solicitado. Limpando PDF em memória...")
            original_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
            repaired_buffer = io.BytesIO()
            original_doc.save(repaired_buffer, garbage=4, deflate=True, clean=True)
            original_doc.close()
            pdf_bytes = repaired_buffer.getvalue()
            print(f"[{datetime.now()}] PDF reparado com sucesso.")

        pdf_doc = fitz.open(stream=pdf_bytes, filetype='pdf')
        print(f"[{datetime.now()}] PDF aberto. {pdf_doc.page_count} páginas.")
    except Exception as e:
        print(f"[{datetime.now()}] Erro ao abrir/reparar PDF: {e}")
        return jsonify({"message": f"Arquivo PDF inválido ou corrompido demais para reparar: {e}"}), 400

    filename = f.filename.rsplit('.', 1)[0]
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        if mode == 'parts':
            try:
                parts = int(request.form.get('parts'))
                if parts <= 0:
                    return jsonify({"message": "O número de partes deve ser maior que 0."}), 400
                if parts > pdf_doc.page_count:
                    return jsonify({"message": f"O número de partes ({parts}) não pode ser maior que o número de páginas ({pdf_doc.page_count})."}), 400
            except (ValueError, TypeError):
                return jsonify({"message": "Número de partes inválido."}), 400

            pages_per_part = math.ceil(pdf_doc.page_count / parts)
            for i in range(parts):
                start_page = i * pages_per_part
                end_page = min(start_page + pages_per_part - 1, pdf_doc.page_count - 1)
                if start_page > end_page:
                    continue
                new_pdf = fitz.open()
                for page_num in range(start_page, end_page + 1):
                    page = pdf_doc[page_num]
                    new_pdf.new_page(width=page.rect.width, height=page.rect.height)
                    new_pdf[-1].show_pdf_page(new_pdf[-1].rect, pdf_doc, page_num)
                output_buffer = io.BytesIO()
                new_pdf.save(output_buffer, garbage=4, deflate=True)
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{i+1}_de_{parts}.pdf", output_buffer.read())
                new_pdf.close()

        elif mode == 'size':
            try:
                max_size_mb = float(request.form.get('max_size_mb'))
                if max_size_mb <= 0:
                    return jsonify({"message": "O tamanho máximo deve ser maior que 0 MB."}), 400
            except (ValueError, TypeError):
                return jsonify({"message": "Tamanho máximo inválido."}), 400

            max_size_bytes = max_size_mb * 1024 * 1024
            part_number = 1
            chunk_start_page = 0

            print(f"[{datetime.now()}] Iniciando divisão por tamanho (busca binária). Limite: {max_size_mb}MB.")

            while chunk_start_page < pdf_doc.page_count:
                print(f"[{datetime.now()}] ===== Bloco #{part_number} (pág. {chunk_start_page + 1}) =====")

                # checa página única
                single_page_doc = fitz.open()
                page = pdf_doc[chunk_start_page]
                single_page_doc.new_page(width=page.rect.width, height=page.rect.height)
                single_page_doc[-1].show_pdf_page(single_page_doc[-1].rect, pdf_doc, chunk_start_page)
                single_page_buffer = io.BytesIO()
                single_page_doc.save(single_page_buffer)
                if single_page_buffer.tell() > max_size_bytes:
                    return jsonify({"message": f"A página {chunk_start_page + 1} sozinha ({single_page_buffer.tell() / (1024*1024):.2f}MB) já é maior que o limite de {max_size_mb} MB."}), 400

                low, high = chunk_start_page, pdf_doc.page_count - 1
                best_end_page = chunk_start_page

                while low <= high:
                    mid = (low + high) // 2
                    test_doc = fitz.open()
                    for page_num in range(chunk_start_page, mid + 1):
                        p = pdf_doc[page_num]
                        test_doc.new_page(width=p.rect.width, height=p.rect.height)
                        test_doc[-1].show_pdf_page(test_doc[-1].rect, pdf_doc, page_num)
                    test_buffer = io.BytesIO()
                    test_doc.save(test_buffer)
                    test_doc.close()

                    if test_buffer.tell() <= max_size_bytes:
                        best_end_page = mid
                        low = mid + 1
                    else:
                        high = mid - 1

                final_chunk_doc = fitz.open()
                for page_num in range(chunk_start_page, best_end_page + 1):
                    p = pdf_doc[page_num]
                    final_chunk_doc.new_page(width=p.rect.width, height=p.rect.height)
                    final_chunk_doc[-1].show_pdf_page(final_chunk_doc[-1].rect, pdf_doc, page_num)
                output_buffer = io.BytesIO()
                final_chunk_doc.save(output_buffer, garbage=4, deflate=True)
                output_buffer.seek(0)
                zipf.writestr(f"{filename}_parte_{part_number}.pdf", output_buffer.read())
                final_chunk_doc.close()

                part_number += 1
                chunk_start_page = best_end_page + 1

    pdf_doc.close()
    zip_buffer.seek(0)
    print(f"[{datetime.now()}] Finalizado. Enviando ZIP.")
    return send_file(zip_buffer, as_attachment=True, download_name=f'{filename}_dividido.zip', mimetype='application/zip')


@app.route('/organize', methods=['POST'])
def organize_pdf():
    file = request.files.get('pdf')
    new_order = json.loads(request.form.get('order'))
    pdf_doc = fitz.open(stream=file.read(), filetype='pdf')
    new_doc = fitz.open()
    for item in new_order:
        # Rotação é aplicada na cópia (insert_pdf mantém a geometria)
        page_index = item['page'] - 1
        new_doc.insert_pdf(pdf_doc, from_page=page_index, to_page=page_index, rotate=item.get('rotation', 0))
    buffer = io.BytesIO()
    new_doc.save(buffer)
    buffer.seek(0)
    return send_file(buffer, as_attachment=True, download_name='organized.pdf')


# ---------------------------- No Cache ----------------------------
@app.after_request
def no_cache(response):
    response.headers['Cache-Control'] = 'no-store'
    return response


if __name__ == '__main__':
    # Para Linux
    app.run(debug=True, host='0.0.0.0', port=5009)
