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
import logo from '../assets/logo.png';

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
          <CardDescription>{t('auth.signInAsAdmin')}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
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

            <Button type="submit" className="w-full" disabled={loading}>
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

          <div className="relative flex items-center justify-center">
            <Separator />
            <span className="absolute bg-card px-2 text-xs uppercase text-muted-foreground">{t('auth.or')}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <span className="font-bold">G</span>
            {loading ? t('auth.redirectingToGoogle') : t('auth.continueWithGoogle')}
          </Button>
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
