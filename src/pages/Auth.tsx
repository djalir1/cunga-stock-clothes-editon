import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Loader2, ShieldCheck, MessageCircle, Mail, ArrowRight, Check } from 'lucide-react';
import { z } from 'zod';
import { CONTACT } from '@/config/contact';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (user) {
    navigate('/dashboard');
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      loginSchema.parse(loginForm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          if (error.path[0]) {
            newErrors[error.path[0] as string] = error.message;
          }
        });
        setErrors(newErrors);
        return;
      }
    }

    setIsLoading(true);
    const { error } = await signIn(loginForm.email, loginForm.password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Login failed',
        description:
          error.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please try again.'
            : error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully logged in.',
      });
      navigate('/dashboard');
    }
  };

  const openGmail = () => {
    const subject = 'Cunga Stock — I would like to set up an account';
    const body = [
      'Hello Cunga Stock team,',
      '',
      'I would like to set up an account. Here are my details:',
      '',
      'Name:',
      'Business / Organisation:',
      'Industry:',
      'Phone:',
      '',
      'Thank you!',
    ].join('\n');
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      CONTACT.email
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    toast({
      title: 'Email ready to send',
      description: 'Just click Send in the Gmail tab we opened.',
    });
  };

  const openWhatsApp = () => {
    const msg = 'Hello Cunga Stock, I would like to set up an account.';
    window.open(
      `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(msg)}`,
      '_blank'
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <Card className="w-full max-w-md relative animate-scale-in">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-start">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to home
            </Link>
          </div>
          <div className="mx-auto mb-4 mt-2 w-24 h-24 rounded-2xl bg-white flex items-center justify-center shadow-glow overflow-hidden p-1">
            <img
              src="/cunga-logo-nobg.png"
              alt="Cunga Stock"
              className="w-full h-full object-contain"
            />
          </div>
          <CardTitle className="text-2xl font-bold">Cunga Stock</CardTitle>
          <CardDescription>Inventory management, tailored to your business</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Get Started</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="admin@yourshop.com"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    className={errors.email ? 'border-destructive' : ''}
                  />
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    className={errors.password ? 'border-destructive' : ''}
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Logging in...
                    </>
                  ) : (
                    'Login'
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <div className="text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center shadow-glow">
                  <ShieldCheck className="w-7 h-7 text-primary-foreground" />
                </div>
                <h3 className="mt-4 text-lg font-semibold">Accounts are set up by our team</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  To keep your data safe and your setup tailored to your business, our team
                  personally creates each account after a short onboarding call.
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
                <div className="text-sm font-semibold">Ready in 3 easy steps</div>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    Book a free demo — we learn how you work
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    We customise your system and create your account
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </span>
                    Sign in and go live with your team
                  </li>
                </ul>
              </div>

              <div className="mt-5 space-y-3">
                <Button
                  type="button"
                  className="w-full gradient-primary text-primary-foreground shadow-glow"
                  onClick={() => navigate('/#demo')}
                >
                  Book a Free Demo
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button type="button" variant="outline" onClick={openWhatsApp}>
                    <MessageCircle className="w-4 h-4 mr-2" />
                    WhatsApp
                  </Button>
                  <Button type="button" variant="outline" onClick={openGmail}>
                    <Mail className="w-4 h-4 mr-2" />
                    Email us
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
