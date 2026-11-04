import { supabase } from '@/integrations/supabase/client';

export const checkIsAdmin = async (): Promise<boolean> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('user_id', user.id)
    .single();

  return profile?.is_admin === true;
};

export const withAdminAuth = async (callback: () => Promise<void>) => {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    throw new Error('Unauthorized');
  }
  return callback();
};

export const resetYearlyLeaderboard = async () => {
  return withAdminAuth(async () => {
    const { error } = await supabase.rpc('reset_yearly_leaderboard');
    if (error) throw error;
  });
};

export const sendPasswordResetEmail = async (email: string) => {
  try {
    const { error } = await supabase.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(2, 10),
      email_confirm: true,
    });

    if (error) {
      throw error;
    }

    const { error: resetError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      },
    });

    if (resetError) {
      throw resetError;
    }

    return { success: true, message: `Password reset link sent to ${email}` };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to send reset email' };
  }
};
