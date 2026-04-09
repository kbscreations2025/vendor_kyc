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