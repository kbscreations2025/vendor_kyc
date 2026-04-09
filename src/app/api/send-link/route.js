import { sendKycLinkEmail } from '@/lib/mailer';

export async function POST(request) {
  try {
    const { to, vendorName, kycLink } = await request.json();

    if (!to || !vendorName || !kycLink) {
      return Response.json(
        { error: 'Missing required fields: to, vendorName, kycLink' },
        { status: 400 }
      );
    }

    const result = await sendKycLinkEmail({ to, vendorName, kycLink });

    if (!result.success) {
      return Response.json(
        { error: result.error || 'Failed to send email' },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (err) {
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
