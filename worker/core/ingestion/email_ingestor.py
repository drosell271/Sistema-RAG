import imaplib
import email
import os
import logging
import uuid
from email.header import decode_header
from datetime import datetime
from .pst_parser import clean_email_body

logger = logging.getLogger(__name__)

class EmailIngestor:
    def __init__(self, config: dict = None):
        self.config = config or {}
        # Prioritize config from DB, then env vars, then defaults
        self.imap_host = self.config.get("IMAP_HOST") or os.getenv("IMAP_HOST")
        self.imap_port = int(self.config.get("IMAP_PORT") or os.getenv("IMAP_PORT") or 0)
        if not self.imap_port:
            logger.warning("IMAP_PORT not configured. Email ingestion may fail.")
        self.imap_user = self.config.get("IMAP_USER") or os.getenv("IMAP_USER")
        self.imap_pass = self.config.get("IMAP_PASSWORD") or os.getenv("IMAP_PASSWORD")
        
        self.uploads_dir = os.getenv("DOCS_DIR")
        if not self.uploads_dir:
            raise ValueError("DOCS_DIR must be set in .env")

        # Load ignored senders
        self.ignored_senders = []
        ignored_config = self.config.get("IGNORED_EMAIL_SENDERS") or os.getenv("IGNORED_EMAIL_SENDERS")
        if ignored_config:
            self.ignored_senders = [s.strip().lower() for s in ignored_config.split(",") if s.strip()]

    def connect(self):
        if not self.imap_host or not self.imap_user or not self.imap_pass:
            logger.warning("IMAP credentials not fully configured. Skiping email check.")
            return None
        
        try:
            mail = imaplib.IMAP4_SSL(self.imap_host, self.imap_port)
            mail.login(self.imap_user, self.imap_pass)
            return mail
        except Exception as e:
            logger.error(f"Failed to connect to IMAP: {e}")
            return None

    def process_inbox(self):
        mail = self.connect()
        if not mail:
            return

        try:
            mail.select("inbox")
            # Search for UNSEEN (unread) emails
            status, messages = mail.search(None, "UNSEEN")
            
            if status != "OK":
                return

            email_ids = messages[0].split()
            if not email_ids:
                logger.info("No new emails found.")
                return

            logger.info(f"Found {len(email_ids)} new emails.")

            processed_emails = []
            for e_id in email_ids:
                result = self._process_email(mail, e_id)
                if result:
                    processed_emails.append(result)
                
            mail.close()
            mail.logout()
            return processed_emails
        except Exception as e:
            logger.error(f"Error processing inbox: {e}")
            return []

    def _process_email(self, mail, email_id):
        try:
            _, msg_data = mail.fetch(email_id, "(RFC822)")
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    subject = self._decode_str(msg["Subject"])
                    sender = self._decode_str(msg["From"])
                    
                    # Check ignored senders
                    sender_lower = sender.lower()
                    if self.ignored_senders:
                        is_ignored = False
                        for ignored in self.ignored_senders:
                            if ignored in sender_lower:
                                is_ignored = True
                                break
                        if is_ignored:
                            logger.info(f"Skipping email {email_id} from ignored sender: {sender}")
                            # Move to processed directly so it doesn't get picked up again
                            self.move_email_to_processed(email_id)
                            return None

                    body = ""
                    is_html = False
                    if msg.is_multipart():
                        for part in msg.walk():
                            content_type = part.get_content_type()
                            content_disposition = str(part.get("Content-Disposition"))
                            try:
                                body_part = part.get_payload(decode=True).decode()
                            except:
                                continue
                                
                            if content_type == "text/plain" and "attachment" not in content_disposition:
                                body += body_part
                                is_html = False
                            elif content_type == "text/html" and "attachment" not in content_disposition and not body:
                                body += body_part
                                is_html = True
                    else:
                        is_html = msg.get_content_type() == "text/html"
                        body = msg.get_payload(decode=True).decode()

                    # Clean the email body to remove thread history
                    body = clean_email_body(body, is_html=is_html)

                    # Save to file
                    doc_id = str(uuid.uuid4())
                    safe_subject = "".join([c if c.isalnum() else "_" for c in subject])[:50]
                    filename = f"email_{safe_subject}.txt"
                    stored_filename = f"{doc_id}_{filename}"
                    file_path = os.path.join(self.uploads_dir, stored_filename)
                    
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(body)
                        
                    logger.info(f"Saved email '{subject}' to {file_path}")
                    
                    # Return info to trigger task
                    return {
                        "file_path": file_path,
                        "doc_id": doc_id,
                        "filename": filename,
                        "sender": sender,
                        "subject": subject,
                        "email_id": email_id  # <--- Added email_id to reference later
                    }
                    
        except Exception as e:
            logger.error(f"Error processing email ID {email_id}: {e}")
            return None

    def move_email_to_processed(self, email_id):
        """
        Moves an email to the 'PROCESSED' folder on the IMAP server.
        Creates the 'PROCESSED' folder if it doesn't exist.
        """
        mail = self.connect()
        if not mail:
            return False
            
        try:
            mail.select("inbox")
            
            # 1. Ensure PROCESSED folder exists
            status, folders = mail.list()
            processed_exists = any("PROCESSED" in str(folder).upper() for folder in folders)
            
            if not processed_exists:
                mail.create("PROCESSED")
                logger.info("Created 'PROCESSED' folder on IMAP server.")
            
            # 2. Copy the email to PROCESSED
            status, _ = mail.copy(email_id, "PROCESSED")
            
            if status == "OK":
                # 3. Mark the original as Deleted
                mail.store(email_id, '+FLAGS', '\\Deleted')
                # 4. Expunge to permanently remove from Inbox
                mail.expunge()
                logger.info(f"Successfully moved email {email_id} to PROCESSED.")
                return True
            else:
                logger.error(f"Failed to copy email {email_id} to PROCESSED.")
                return False
                
        except Exception as e:
            logger.error(f"Error moving email {email_id} to PROCESSED: {e}")
            return False
        finally:
            try:
                mail.close()
                mail.logout()
            except:
                pass

    def _decode_str(self, header_value):
        if not header_value:
            return ""
        decoded_list = decode_header(header_value)
        decoded_str = ""
        for content, encoding in decoded_list:
            if isinstance(content, bytes):
                if encoding:
                    try:
                        decoded_str += content.decode(encoding)
                    except:
                        decoded_str += content.decode("utf-8", errors="ignore")
                else:
                    decoded_str += content.decode("utf-8", errors="ignore")
            else:
                decoded_str += str(content)
        return decoded_str
