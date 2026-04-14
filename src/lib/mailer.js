import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true', // false for port 25
  auth: process.env.SMTP_USER
    ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      }
    : undefined,
});

export async function sendKycLinkEmail({ to, vendorName, kycLink }) {
  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM}>`,
      to,
      subject: 'KBS - Vendor KYC Form Link',
      html: `<p>Hello ${vendorName},</p>
             <p>Click below to complete KYC:</p>
             <a href="${kycLink}">${kycLink}</a>`,
    });

    return { success: true };
  } catch (err) {
    console.error('Mailer Error:', err);
    return { success: false, error: err.message };
  }
}

export async function sendAdminSubmissionNotification({ vendorName, pan, tradeName, contactEmail, contactNo, submittedAt, reviewUrl }) {
  try {
    const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
    if (!adminEmail) {
      console.warn('[Mailer] ADMIN_NOTIFY_EMAIL not configured — skipping admin notification');
      return { success: false, error: 'Admin email not configured' };
    }

    const submittedDate = new Date(submittedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM}>`,
      to: adminEmail,
      subject: `New KYC Submission - ${vendorName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #1e40af; color: white; padding: 16px 20px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0; font-size: 18px;">New Vendor KYC Submission</h2>
          </div>
          <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 16px; color: #374151;">A new KYC form has been submitted by a vendor. Please review it in the admin dashboard.</p>
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <tr><td style="padding: 8px 0; color: #6b7280; width: 140px;"><strong>Vendor Name:</strong></td><td style="padding: 8px 0; color: #111827;">${vendorName}</td></tr>
              <tr><td style="padding: 8px 0; color: #6b7280;"><strong>PAN:</strong></td><td style="padding: 8px 0; color: #111827;">${pan}</td></tr>
              ${tradeName ? `<tr><td style="padding: 8px 0; color: #6b7280;"><strong>Trade Name:</strong></td><td style="padding: 8px 0; color: #111827;">${tradeName}</td></tr>` : ''}
              ${contactEmail ? `<tr><td style="padding: 8px 0; color: #6b7280;"><strong>Email:</strong></td><td style="padding: 8px 0; color: #111827;">${contactEmail}</td></tr>` : ''}
              ${contactNo ? `<tr><td style="padding: 8px 0; color: #6b7280;"><strong>Contact:</strong></td><td style="padding: 8px 0; color: #111827;">${contactNo}</td></tr>` : ''}
              <tr><td style="padding: 8px 0; color: #6b7280;"><strong>Submitted At:</strong></td><td style="padding: 8px 0; color: #111827;">${submittedDate}</td></tr>
            </table>
            ${reviewUrl ? `<div style="margin-top: 20px;"><a href="${reviewUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">Review Submission</a></div>` : ''}
            <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af;">This is an automated notification from KBS Vendor KYC system.</p>
          </div>
        </div>
      `,
    });

    return { success: true };
  } catch (err) {
    console.error('Admin Mailer Error:', err);
    return { success: false, error: err.message };
  }
}