import { sendAdminSubmissionNotification } from '@/lib/mailer';

export async function POST(request) {
  try {
    const body = await request.json();
    const { vendorName, pan, tradeName, contactEmail, contactNo, submittedAt, reviewUrl } = body;

    if (!vendorName || !pan) {
      return Response.json({ error: 'Missing required fields: vendorName, pan' }, { status: 400 });
    }

    const result = await sendAdminSubmissionNotification({
      vendorName,
      pan,
      tradeName,
      contactEmail,
      contactNo,
      submittedAt: submittedAt || new Date().toISOString(),
      reviewUrl,
    });

    if (!result.success) {
      return Response.json({ error: result.error || 'Failed to send notification' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('notify-submission error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
