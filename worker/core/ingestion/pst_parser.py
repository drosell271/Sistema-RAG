import os
import logging
from datetime import datetime
from typing import Iterator, Dict
import pypff
from bs4 import BeautifulSoup
import re

logger = logging.getLogger(__name__)


def clean_email_body(body: str, is_html: bool = False) -> str:
    """
    Extracts the 'latest' message from an email body, removing the thread history.
    Only keeps the subject/current message, not the entire conversation.
    """
    text = body
    if is_html and body:
        try:
            soup = BeautifulSoup(body, 'html.parser')
            text = soup.get_text(separator='\n')
        except Exception:
            pass

    if not text:
        return ""

    # Strict thread cutting with Block Detection
    # Look for a "Header Block": A line starting with From/De followed nearby by Sent/Enviado/To/Para/Subject/Asunto
    
    lines = text.splitlines()
    cut_lines = []
    
    # Patterns
    # 1. Strict single-line: "De: Name <email>"
    single_line_pattern = re.compile(r'^(De|From):\s+.*<.+?>', re.IGNORECASE)
    
    # 2. Block start candidates
    header_start_pattern = re.compile(r'^(De|From):', re.IGNORECASE)
    
    # 3. Secondary patterns that confirm a block (Sent, To, Subject, etc.)
    secondary_header_pattern = re.compile(r'^(Sent|Enviado|To|Para|Subject|Asunto|Date|Fecha):', re.IGNORECASE)

    stop_processing = False

    for i, line in enumerate(lines):
        if stop_processing:
            break
            
        clean_line = line.strip()
        
        # Method A: Strict Single Line (High Confidence)
        if single_line_pattern.match(clean_line):
            break
            
        # Method B: Block Detection (Context Aware)
        # If we see "De:" or "From:", look ahead N lines for another header key
        if header_start_pattern.match(clean_line):
            # Look ahead next 6 lines
            is_header_block = False
            for forward_offset in range(1, 7):
                if i + forward_offset < len(lines):
                    next_line = lines[i + forward_offset].strip()
                    if secondary_header_pattern.match(next_line):
                        is_header_block = True
                        break
            
            if is_header_block:
                logger.info(f"Cut email thread at block detected on line: {clean_line}")
                break
                
        cut_lines.append(line.rstrip())

    text = '\n'.join(cut_lines)

    # Post-processing whitespace cleanup
    # 1. Collapse 3+ newlines to 2 (if there were many empty lines, leave 1 empty line)
    text = re.sub(r'\n{3,}', '\n\n', text)
    # 2. Collapse 2 newlines to 1 (if there was 1 empty line, remove it)
    text = re.sub(r'\n{2}', '\n', text)

    return text.strip()


def _traverse_folder(folder: pypff.folder) -> Iterator[pypff.message]:
    """
    Recursively traverse PST folders and yield all messages.
    """
    # Yield messages in this folder
    for i in range(folder.number_of_sub_messages):
        try:
            message = folder.get_sub_message(i)
            if message:
                yield message
        except Exception as e:
            logger.warning(f"Failed to get message {i}: {e}")

    # Recursively traverse subfolders
    for i in range(folder.number_of_sub_folders):
        try:
            sub_folder = folder.get_sub_folder(i)
            if sub_folder:
                yield from _traverse_folder(sub_folder)
        except Exception as e:
            logger.warning(f"Failed to traverse subfolder {i}: {e}")


def extract_emails_from_pst(file_path: str) -> Iterator[Dict]:
    """
    Yields extracted emails from a PST file using libpff/pypff.
    Each email is cleaned to only contain the latest message, not the thread.
    """
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        return

    pst_file = None
    try:
        logger.info(f"Opening PST file: {file_path}")
        pst_file = pypff.file()
        pst_file.open(file_path)

        root_folder = pst_file.get_root_folder()
        if not root_folder:
            logger.warning("No root folder found in PST file")
            return

        email_count = 0
        for message in _traverse_folder(root_folder):
            try:
                subject = message.subject if message.subject else "(Sin Asunto)"

                # Try to get plain text body first, then HTML
                body = message.plain_text_body
                is_html = False
                if not body:
                    body = message.html_body
                    is_html = True

                if not body:
                    logger.debug(f"Skipping message with no body: {subject}")
                    continue

                # Decode bytes to string if necessary
                if isinstance(body, bytes):
                    body = body.decode('utf-8', errors='ignore')

                # Clean the body to only keep the latest message
                cleaned_content = clean_email_body(body, is_html=is_html)

                if not cleaned_content or not cleaned_content.strip():
                    logger.debug(f"Skipping message with empty content: {subject}")
                    continue

                # Get metadata
                try:
                    date = message.delivery_time if message.delivery_time else datetime.utcnow()
                except Exception:
                    date = datetime.utcnow()

                try:
                    sender = message.sender_name if message.sender_name else "Unknown"
                except Exception:
                    sender = "Unknown"

                email_count += 1
                yield {
                    "subject": subject,
                    "content": cleaned_content,
                    "date": date,
                    "sender": sender,
                    "original_folder": ""
                }

            except Exception as e:
                logger.warning(f"Failed to process message: {e}")
                continue

        logger.info(f"Extracted {email_count} emails from PST file")

    except Exception as e:
        logger.error(f"Failed to process PST file {file_path}: {e}")

    finally:
        if pst_file:
            try:
                pst_file.close()
            except Exception:
                pass
