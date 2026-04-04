import { signOut } from '@/lib/auth';

export async function POST() {
  try {
    await signOut();
    return Response.json({ success: true });
  } catch {
    return Response.json({ success: true }); // Always succeed for logout
  }
}
