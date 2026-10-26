import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useLanguage } from '../contexts/LanguageContext';
import { POST_LOGIN_REDIRECT_KEY, isSafeRedirectPath } from '../utils/postLoginRedirect';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import logo from '../assets/logo-128.webp';

// Google's "G" in its brand colours (sign-in button guidelines).
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5 shrink-0" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function Auth() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLogin, setIsLogin] = useState(true);

  // Where to send the user after login (set by "log in to register" links).
  const from = isSafeRedirectPath(location.state?.from) ? location.state.from : null;

  useEffect(() => {
    if (from) sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, from);
  }, [from]);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
  });

  const { user, signIn, signUp, resetPassword, signInWithGoogle, nativeAuthError } = useAuth();

  // A signed-in user has no business on the login page: send them on. This is
  // the only place that navigates after a login, whichever way it happened:
  // - email/password: signIn resolves and onAuthStateChange sets `user`;
  // - Google in the browser: the OAuth round trip reloads the app elsewhere,
  //   so this rarely fires (App.jsx restores the stored destination);
  // - Google in the Android shell: the session arrives through the deep link
  //   while the app is still sitting on /login — without this the form kept
  //   showing to a user who was in fact logged in.
  // Only when rendered as the /login route: protected routes also render
  // <Auth /> inline and swap to their real page by themselves.
  useEffect(() => {
    if (!user || location.pathname !== '/login') return;
    const stored = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    navigate(from || (isSafeRedirectPath(stored) ? stored : '/dashboard'), { replace: true });
  }, [user, from, location.pathname, navigate]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password);
        if (error) setError(error.message);
        // Success: the effect above navigates once `user` is set.
      } else {
        if (formData.password !== formData.confirmPassword) {
          setError(t('auth.passwordsDoNotMatch'));
          setLoading(false);
          return;
        }

        if (formData.password.length < 6) {
          setError(t('auth.passwordTooShort'));
          setLoading(false);
          return;
        }

        const { error } = await signUp(formData.email, formData.password, {
          full_name: formData.fullName,
          // Role is not set by default - admins must be assigned manually via Supabase Dashboard
        });

        if (error) {
          setError(error.message);
        } else {
          setSuccess(t('auth.checkEmailConfirmation'));
        }
      }
    } catch {
      setError(t('auth.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error, pending } = await signInWithGoogle();
      if (error) {
        setError(error.message);
        setLoading(false);
      } else if (pending) {
        // Native shell: the system browser is open now; the user may also
        // cancel there, so don't leave the form stuck in a loading state.
        setLoading(false);
      }
    } catch {
      setError(t('auth.unexpectedError'));
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      setError(t('auth.enterEmailFirst'));
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await resetPassword(formData.email);
      if (error) {
        setError(error.message);
      } else {
        setSuccess(t('auth.passwordResetEmailSent'));
      }
    } catch {
      setError(t('auth.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-6 bg-muted/40 text-foreground">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <img src={logo} alt="DartLead" className="mx-auto size-14" />
          <CardTitle className="text-2xl font-semibold tracking-tight">DartLead</CardTitle>
          <CardDescription>{t('auth.signInSubtitle')}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {/* Google first and big: on a phone the email form pushed it below the
              fold and people signed up with a password without noticing it. */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full gap-3 text-base font-semibold"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <GoogleMark />
            {loading ? t('auth.redirectingToGoogle') : t('auth.continueWithGoogle')}
          </Button>

          <div className="relative flex items-center justify-center">
            <Separator />
            <span className="absolute bg-card px-2 text-xs uppercase text-muted-foreground">{t('auth.orWithEmail')}</span>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {!isLogin && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="fullName">{t('auth.fullName')}</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder={t('auth.enterFullName')}
                  required={!isLogin}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder={t('auth.enterEmail')}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder={t('auth.enterPassword')}
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-1/2 right-0.5 -translate-y-1/2 text-muted-foreground"
                  aria-label={t('auth.password')}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>

            {!isLogin && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder={t('auth.confirmYourPassword')}
                  required={!isLogin}
                />
              </div>
            )}

            {(error || nativeAuthError) && (
              <Alert variant="destructive">
                <AlertDescription>{error || nativeAuthError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" variant="secondary" className="w-full" disabled={loading}>
              {loading ? t('common.loading') : (isLogin ? t('auth.signIn') : t('auth.signUp'))}
            </Button>

            {isLogin && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="self-center"
                onClick={handleForgotPassword}
                disabled={loading}
              >
                {t('auth.forgotPassword')}
              </Button>
            )}
          </form>

        </CardContent>

        <CardFooter className="justify-center">
          <p className="flex items-center text-sm text-muted-foreground">
            {isLogin ? t('auth.dontHaveAccount') : t('auth.alreadyHaveAccount')}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="px-1"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
                setSuccess('');
                setFormData({
                  email: '',
                  password: '',
                  confirmPassword: '',
                  fullName: '',
                });
              }}
            >
              {isLogin ? t('auth.signUp') : t('auth.signIn')}
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
