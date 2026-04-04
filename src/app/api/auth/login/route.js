import { signIn } from '@/lib/auth';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return Response.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { user, error } = await signIn(email, password);

    if (error) {
      return Response.json(
        { error },
        { status: 401 }
      );
    }

    return Response.json({
      success: true,
      user,
    });
  } catch (err) {
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
