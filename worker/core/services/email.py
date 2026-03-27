import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        # Enforce SMTP (Real Backend)
        self.smtp_host = os.getenv("SMTP_HOST", "")
        self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        self.smtp_user = os.getenv("SMTP_USER", "")
        self.smtp_pass = os.getenv("SMTP_PASSWORD", "")
        self.email_from = os.getenv("EMAIL_FROM", "")

        if not self.smtp_host or not self.smtp_user:
            logger.warning("SMTP credentials missing! Worker emails will fail.")

    def send_email(self, to_email: str, subject: str, body: str):
        """Sends an email via SMTP. No simulation fallback."""
        try:
            msg = MIMEMultipart()
            msg["From"] = self.email_from
            msg["To"] = to_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain"))

            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            server.login(self.smtp_user, self.smtp_pass)
            server.send_message(msg)
            server.quit()
            logger.info(f"Email sent to {to_email}")
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            # Raise exception or just log? User wants strict real mode, so maybe logging is enough but no fallback.
            # I will just log error.

# Global Instance
email_service = EmailService()
