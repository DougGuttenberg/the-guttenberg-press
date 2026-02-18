import nodemailer from 'nodemailer';
import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import { createLogger } from './logger.js';

const log = createLogger('email');

// ─── SENDING (SMTP via Gmail) ───

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });
    log.info('SMTP transporter initialized');
  }
  return transporter;
}

/**
 * Send an email.
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Subject line
 * @param {string} params.text - Plain text body
 * @param {string} params.html - HTML body
 * @returns {Promise<object>} Send result
 */
export async function sendEmail({ to, subject, text, html }) {
  const t = getTransporter();
  const from = `"Daily Paper" <${process.env.GMAIL_USER}>`;

  try {
    const result = await t.sendMail({ from, to, subject, text, html });
    log.info('Email sent', { to, subject, messageId: result.messageId });
    return { success: true, messageId: result.messageId, sentAt: new Date().toISOString() };
  } catch (error) {
    log.error(`Email send failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ─── RECEIVING (IMAP via Gmail) ───

/**
 * Check the paper inbox for new unread emails.
 * Marks them as read after retrieval.
 * @returns {Promise<Array>} Array of parsed email objects
 */
export async function checkInbox() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER and GMAIL_APP_PASSWORD must be set');
  }

  const config = {
    imap: {
      user: process.env.GMAIL_USER,
      password: process.env.GMAIL_APP_PASSWORD,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  let connection;
  try {
    connection = await imapSimple.connect(config);
    await connection.openBox('INBOX');

    // Search for unread messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: true,
      struct: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    log.info(`Found ${messages.length} unread emails in paper inbox`);

    const parsed = [];
    for (const msg of messages) {
      try {
        const fullBody = msg.parts.find(p => p.which === '');
        if (fullBody) {
          const email = await simpleParser(fullBody.body);
          parsed.push({
            from: email.from?.text || 'unknown',
            subject: email.subject || '(no subject)',
            date: email.date?.toISOString() || new Date().toISOString(),
            text: email.text || '',
            html: email.html || '',
            attachments: (email.attachments || []).map(a => ({
              filename: a.filename,
              contentType: a.contentType,
              size: a.size
            }))
          });
        }
      } catch (parseErr) {
        log.warn(`Failed to parse email: ${parseErr.message}`);
      }
    }

    return parsed;
  } catch (error) {
    log.error(`IMAP connection error: ${error.message}`);
    return [];
  } finally {
    if (connection) {
      try { connection.end(); } catch (_) { /* ignore */ }
    }
  }
}

/**
 * Extract content from a "Send to Paper" email.
 * Handles text, links, and forwarded content.
 * @param {object} email - Parsed email object
 * @returns {object} Structured content for the pipeline
 */
export function extractPaperContent(email) {
  const content = email.text || '';
  const subject = email.subject || '';

  // Extract any URLs from the email body
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\][\n]+/g;
  const urls = content.match(urlRegex) || [];

  // Check if this is a forwarded email
  const isForwarded = subject.toLowerCase().startsWith('fwd:') ||
    subject.toLowerCase().startsWith('fw:') ||
    content.includes('---------- Forwarded message ----------');

  // Extract Doug's note (text before forwarded content)
  let dougNote = '';
  if (isForwarded) {
    const fwdMarker = content.indexOf('---------- Forwarded message ----------');
    if (fwdMarker > 0) {
      dougNote = content.substring(0, fwdMarker).trim();
    }
  } else {
    // If it's a direct send, the whole body might be the note
    dougNote = content.trim();
  }

  return {
    source: "Doug's Inbox",
    title: subject.replace(/^(fwd?:|fw:)\s*/i, '').trim(),
    content: content,
    link: urls[0] || null,
    links: urls,
    published: email.date,
    retrieved_at: new Date().toISOString(),
    manual_send: true,
    doug_note: dougNote || null,
    is_forwarded: isForwarded,
    has_attachments: email.attachments.length > 0
  };
}

export default { sendEmail, checkInbox, extractPaperContent };
