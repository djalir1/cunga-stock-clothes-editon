import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  History as HistoryIcon,
  BarChart3,
  Bell,
  Users,
  Layers,
  ShieldCheck,
  Smartphone,
  Zap,
  Shirt,
  Factory,
  Store,
  Warehouse,
  UtensilsCrossed,
  Pill,
  Wrench,
  Building2,
  Menu,
  X,
  Sun,
  Moon,
  Check,
  ArrowRight,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Cloud,
  Monitor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTheme } from '@/contexts/ThemeContext';
import { CONTACT } from '@/config/contact';

type IndustryKey =
  | 'clothing'
  | 'factories'
  | 'retail'
  | 'warehouses'
  | 'restaurants'
  | 'pharmacies'
  | 'workshops'
  | 'offices';

interface Industry {
  key: IndustryKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tagline: string;
  features: string[];
}

const INDUSTRIES: Industry[] = [
  {
    key: 'clothing',
    label: 'Clothing Stores',
    icon: Shirt,
    tagline: 'Every garment, size and sale — tracked with confidence.',
    features: [
      'Track stock by category, size & colour',
      'Items out on approval or reserved for customers',
      'Storekeeper & supervisor roles',
      'Daily, weekly & monthly sales reports',
    ],
  },
  {
    key: 'factories',
    label: 'Factories',
    icon: Factory,
    tagline: 'From raw materials to finished goods, all logged.',
    features: [
      'Track raw materials & consumables',
      'Batch / lot numbers per production run',
      'Production consumption logging',
      'Waste & rejects tracking',
    ],
  },
  {
    key: 'retail',
    label: 'Retail Shops',
    icon: Store,
    tagline: 'Faster sales, cleaner stock, happier customers.',
    features: [
      'Barcode & SKU catalog',
      'Multi-branch stock overview',
      'Sales-linked stock deductions',
      'Automatic reorder alerts',
    ],
  },
  {
    key: 'warehouses',
    label: 'Warehouses',
    icon: Warehouse,
    tagline: 'Know exactly what is on every shelf, every day.',
    features: [
      'Location & bin management',
      'Goods received & dispatched notes',
      'Cycle counts & full audits',
      'Multi-user picking workflow',
    ],
  },
  {
    key: 'restaurants',
    label: 'Restaurants & Bars',
    icon: UtensilsCrossed,
    tagline: 'Control ingredients and drinks with zero waste.',
    features: [
      'Ingredient & drink stock',
      'Recipe-based deductions',
      'Daily wastage log',
      'Supplier delivery tracking',
    ],
  },
  {
    key: 'pharmacies',
    label: 'Pharmacies & Clinics',
    icon: Pill,
    tagline: 'Safety, expiry and traceability in one place.',
    features: [
      'Expiry-date & batch tracking',
      'Prescription-linked movements',
      'Controlled substance logs',
      'Low-stock & near-expiry alerts',
    ],
  },
  {
    key: 'workshops',
    label: 'Workshops & Garages',
    icon: Wrench,
    tagline: 'Parts, tools and jobs — always in sync.',
    features: [
      'Parts & consumables catalog',
      'Job-card linked issuance',
      'Tool checkout tracking',
      'Supplier & purchase orders',
    ],
  },
  {
    key: 'offices',
    label: 'Offices & NGOs',
    icon: Building2,
    tagline: 'Assets, supplies and donations, fully accountable.',
    features: [
      'Office supplies & assets register',
      'Donation / grant item tracking',
      'Department-level requests',
      'Audit-ready activity reports',
    ],
  },
];

const FEATURES = [
  {
    icon: Boxes,
    title: 'Real-time Inventory',
    body: 'Live counts across every branch and store, updated the moment a movement happens.',
  },
  {
    icon: HistoryIcon,
    title: 'Movement History',
    body: 'Every IN, OUT, transfer and adjustment is logged with who, when and why.',
  },
  {
    icon: BarChart3,
    title: 'Smart Reports',
    body: 'PDF & CSV exports for audits, boards, donors and management reviews.',
  },
  {
    icon: Bell,
    title: 'Low-stock Alerts',
    body: 'Set reorder points so you never run out of what matters most.',
  },
  {
    icon: Users,
    title: 'Role-based Access',
    body: 'Storekeeper, supervisor, manager — each sees exactly what they should.',
  },
  {
    icon: Layers,
    title: 'Categories & Variants',
    body: 'Sizes, colours, batches, expiry — model your stock the way it really is.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure Cloud Storage',
    body: 'Encrypted, backed up daily. Your data is safe and always available.',
  },
  {
    icon: Smartphone,
    title: 'Works Anywhere',
    body: 'Phones, tablets, laptops — same clean experience, wherever you are.',
  },
  {
    icon: Zap,
    title: 'Fast Onboarding',
    body: 'We import your existing lists so you go live in days, not months.',
  },
];

const STEPS = [
  { n: 1, title: 'Book a demo', body: 'Tell us about your business in a short call.' },
  { n: 2, title: 'We customise your system', body: 'Categories, roles and workflows tailored to you.' },
  { n: 3, title: 'Train your team', body: 'Hands-on training so everyone is confident from day one.' },
  { n: 4, title: 'Go live & grow', body: 'Support, reports and improvements as you scale.' },
];

const BENEFITS = [
  'Stop losing stock to untracked movements',
  'Cut hours of paperwork every week',
  'Know what to reorder before you run out',
  'Give every user the right level of access',
  'Prove exactly what happened in every audit',
  'One system across every location',
];

const STATS = [
  { big: '100%', label: 'Digital record keeping' },
  { big: '5x', label: 'Faster stock audits' },
  { big: 'Zero', label: 'Lost paperwork' },
  { big: 'Multi', label: 'User roles' },
];

function friendlyIndustry(value: string): string {
  if (!value) return '';
  const match = INDUSTRIES.find((i) => i.key === value);
  if (match) return match.label;
  return value;
}

export default function Landing() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryKey>('clothing');
  const activeIndustry = useMemo(
    () => INDUSTRIES.find((i) => i.key === selectedIndustry) ?? INDUSTRIES[0],
    [selectedIndustry]
  );

  const [form, setForm] = useState({
    name: '',
    business: '',
    industry: '',
    role: '',
    phone: '',
    email: '',
    message: '',
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.replace('#', '');
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    });
  }, []);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const pickIndustryAndBook = (key: IndustryKey) => {
    setForm((f) => ({ ...f, industry: key }));
    setMobileOpen(false);
    setTimeout(() => scrollToId('demo'), 20);
  };

  const buildMessage = () => {
    const lines: string[] = [];
    lines.push('Cunga Stock — Demo request');
    lines.push('');
    if (form.name) lines.push(`Name: ${form.name}`);
    if (form.business) lines.push(`Business / Organisation: ${form.business}`);
    if (form.industry) lines.push(`Industry: ${friendlyIndustry(form.industry)}`);
    if (form.role) lines.push(`Role: ${form.role}`);
    if (form.email) lines.push(`Email: ${form.email}`);
    if (form.phone) lines.push(`Phone: ${form.phone}`);
    lines.push('');
    if (form.message) {
      lines.push('Message:');
      lines.push(form.message);
    }
    return lines.join('\n');
  };

  const validate = () => {
    if (!form.name.trim() || !form.business.trim() || !form.phone.trim()) {
      toast({
        title: 'Missing details',
        description: 'Please fill in your name, business and phone number.',
        variant: 'destructive',
      });
      return false;
    }
    return true;
  };

  const sendWhatsApp = () => {
    if (!validate()) return;
    const msg = buildMessage();
    window.open(
      `https://wa.me/${CONTACT.whatsappNumber}?text=${encodeURIComponent(msg)}`,
      '_blank'
    );
    toast({
      title: 'Opening WhatsApp',
      description: 'Your details are ready to send.',
    });
  };

  const sendEmail = () => {
    if (!validate()) return;
    const subject = 'Cunga Stock — Demo request';
    const body = buildMessage();
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      CONTACT.email
    )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    toast({
      title: 'Email ready to send',
      description: 'Just click Send in the Gmail tab we opened.',
    });
  };

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Industries', href: '#industries' },
    { label: 'How it works', href: '#how' },
    { label: 'Contact', href: '#demo' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-background/80 backdrop-blur-md border-b border-border'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            <Link to="/" className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm p-1 flex-shrink-0">
                <img
                  src="/cunga-logo-nobg.png"
                  alt="Cunga Stock"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0 hidden sm:block">
                <div className="text-base font-bold leading-tight truncate">Cunga Stock</div>
                <div className="text-[11px] text-muted-foreground leading-tight truncate">
                  Inventory Management, Your Way
                </div>
              </div>
            </Link>

            <nav className="hidden lg:flex items-center gap-6">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="w-9 h-9 rounded-lg border border-border bg-background/60 hover:bg-muted flex items-center justify-center transition-colors"
              >
                {theme === 'light' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </button>
              <Link
                to="/auth"
                className="hidden sm:inline-flex text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-2 rounded-lg transition-colors"
              >
                Login
              </Link>
              <button
                type="button"
                onClick={() => scrollToId('demo')}
                className="hidden sm:inline-flex gradient-primary text-primary-foreground text-sm font-semibold px-4 py-2 rounded-lg shadow-glow hover:opacity-95 transition-opacity"
              >
                Book a Demo
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen((v) => !v)}
                className="lg:hidden w-9 h-9 rounded-lg border border-border flex items-center justify-center"
                aria-label="Menu"
              >
                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {mobileOpen && (
            <div className="lg:hidden pb-4 animate-fade-in">
              <div className="flex flex-col gap-1 border-t border-border pt-3">
                {navLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setMobileOpen(false)}
                    className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted"
                  >
                    {l.label}
                  </a>
                ))}
                <Link
                  to="/auth"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2 rounded-lg text-sm font-medium hover:bg-muted"
                >
                  Login
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    setTimeout(() => scrollToId('demo'), 20);
                  }}
                  className="mt-2 w-full gradient-primary text-primary-foreground text-sm font-semibold px-4 py-2.5 rounded-lg"
                >
                  Book a Demo
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative pt-28 sm:pt-32 lg:pt-36 pb-16 sm:pb-20 lg:pb-28 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute top-40 right-0 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-accent/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 w-72 h-72 sm:w-96 sm:h-96 rounded-full bg-primary/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background/60 backdrop-blur text-xs sm:text-sm text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              One inventory system, tailored to your business
            </div>

            <h1 className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
              Stock management for{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                every kind of business
              </span>
            </h1>

            <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Cunga Stock powers clothing stores, factories, retail shops, warehouses, restaurants and more —
              customised to how your team actually works. One clean system, endless possibilities.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => scrollToId('demo')}
                className="w-full sm:w-auto gradient-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl shadow-glow hover:opacity-95 transition inline-flex items-center justify-center gap-2"
              >
                Book a Free Demo
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollToId('industries')}
                className="w-full sm:w-auto border border-border bg-background/60 hover:bg-muted font-semibold px-6 py-3 rounded-xl transition inline-flex items-center justify-center gap-2"
              >
                See your industry
              </button>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs sm:text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Cloud className="w-4 h-4 text-primary" /> Secure cloud
              </span>
              <span className="inline-flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" /> Role-based accounts
              </span>
              <span className="inline-flex items-center gap-2">
                <Monitor className="w-4 h-4 text-primary" /> Any device
              </span>
            </div>
          </div>

          {/* Preview card */}
          <div className="mt-12 sm:mt-16 max-w-5xl mx-auto animate-slide-up">
            <div className="rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-muted/50">
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-warning/60" />
                  <span className="w-2.5 h-2.5 rounded-full bg-success/60" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mx-auto max-w-sm text-[11px] sm:text-xs text-muted-foreground bg-background/60 border border-border rounded-md px-2 py-1 truncate text-center">
                    cungastock.com / dashboard
                  </div>
                </div>
                <div className="w-10 flex-shrink-0" />
              </div>

              <div className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  {[
                    { label: 'Total Items', value: '1,248', accent: 'text-primary' },
                    { label: 'Movements this week', value: '312', accent: 'text-accent' },
                    { label: 'Low stock', value: '7', accent: 'text-warning' },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-xl border border-border bg-background p-3 sm:p-4 min-w-0"
                    >
                      <div className="text-[11px] sm:text-xs text-muted-foreground truncate">
                        {s.label}
                      </div>
                      <div className={`mt-1 text-xl sm:text-2xl font-bold ${s.accent}`}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 sm:mt-6 rounded-xl border border-border bg-background">
                  <div className="px-3 sm:px-4 py-2.5 border-b border-border text-xs sm:text-sm font-semibold">
                    Recent Movements
                  </div>
                  <ul className="divide-y divide-border">
                    {[
                      { name: 'Raw Cotton', tag: 'IN', qty: '250 kg', color: 'text-success' },
                      { name: 'Denim Jacket (M)', tag: 'SOLD', qty: '1 pc', color: 'text-primary' },
                      { name: 'Paracetamol 500mg', tag: 'OUT', qty: '30 tabs', color: 'text-warning' },
                    ].map((r) => (
                      <li
                        key={r.name}
                        className="px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm min-w-0"
                      >
                        <span className="truncate font-medium">{r.name}</span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span
                            className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md bg-muted ${r.color}`}
                          >
                            {r.tag}
                          </span>
                          <span className="text-muted-foreground">{r.qty}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/40 py-16 sm:py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              Everything you need to run stock well
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              A complete toolkit that grows with you — designed so anyone on your team can use it.
            </p>
          </div>

          <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-2xl border border-border bg-card p-5 sm:p-6 hover:shadow-lg hover:border-primary/40 transition-all"
              >
                <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow transition-transform group-hover:scale-110">
                  <Icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <h3 className="mt-4 text-base sm:text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="py-16 sm:py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              Customised for how you work
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Pick your business type — Cunga Stock adapts. Same clean core, tailored to your reality.
            </p>
          </div>

          <div className="mt-8 sm:mt-10 -mx-4 sm:mx-0">
            <div className="flex sm:flex-wrap sm:justify-center gap-2 sm:gap-3 overflow-x-auto px-4 sm:px-0 pb-2 sm:pb-0 scrollbar-none">
              {INDUSTRIES.map((ind) => {
                const active = ind.key === selectedIndustry;
                const Icon = ind.icon;
                return (
                  <button
                    key={ind.key}
                    type="button"
                    onClick={() => setSelectedIndustry(ind.key)}
                    className={`flex-shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs sm:text-sm font-medium border transition-all ${
                      active
                        ? 'gradient-primary text-primary-foreground border-transparent shadow-glow'
                        : 'bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="whitespace-nowrap">{ind.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-8 sm:mt-10 rounded-2xl border border-border bg-card overflow-hidden shadow-lg animate-scale-in">
            <div className="grid grid-cols-1 lg:grid-cols-5">
              <div className="lg:col-span-2 gradient-primary text-primary-foreground p-6 sm:p-8 lg:p-10 flex flex-col justify-between gap-6">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center backdrop-blur">
                    <activeIndustry.icon className="w-6 h-6" />
                  </div>
                  <h3 className="mt-4 text-xl sm:text-2xl font-bold">{activeIndustry.label}</h3>
                  <p className="mt-2 text-sm sm:text-base text-primary-foreground/85">
                    {activeIndustry.tagline}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => pickIndustryAndBook(activeIndustry.key)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white text-primary font-semibold px-4 py-2.5 rounded-lg hover:bg-white/90 transition"
                >
                  Book a demo for {activeIndustry.label}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="lg:col-span-3 p-6 sm:p-8 lg:p-10">
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  Tailored features
                </div>
                <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  {activeIndustry.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                      <span className="text-sm sm:text-base min-w-0">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="bg-muted/40 py-16 sm:py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              From first call to fully live, in four steps
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              We do the heavy lifting so your team is ready from day one.
            </p>
          </div>

          <div className="mt-10 sm:mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6 hover:shadow-lg hover:border-primary/40 transition"
              >
                <div className="w-10 h-10 rounded-xl gradient-primary text-primary-foreground font-bold flex items-center justify-center shadow-glow">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base sm:text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Cunga */}
      <section className="py-16 sm:py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
                Save time. Cut losses. Stay in control.
              </h2>
              <p className="mt-4 text-sm sm:text-base text-muted-foreground">
                Whether you run a clothing boutique, a factory floor or a growing chain of shops — Cunga Stock
                gives you the clarity to make better decisions, every day.
              </p>
              <ul className="mt-6 space-y-3">
                {BENEFITS.map((b) => (
                  <li key={b} className="flex items-start gap-3 min-w-0">
                    <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-sm sm:text-base min-w-0">{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <button
                  type="button"
                  onClick={() => scrollToId('demo')}
                  className="w-full sm:w-auto gradient-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl shadow-glow hover:opacity-95 transition inline-flex items-center justify-center gap-2"
                >
                  Book a Free Demo
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-border bg-card p-5 sm:p-6 text-center hover:shadow-lg hover:border-primary/40 transition"
                >
                  <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    {s.big}
                  </div>
                  <div className="mt-2 text-xs sm:text-sm text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Book a Demo */}
      <section id="demo" className="bg-muted/40 py-16 sm:py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight">
              Book your free demo
            </h2>
            <p className="mt-3 text-sm sm:text-base text-muted-foreground">
              Tell us a little about your business and we will show you exactly how Cunga Stock fits.
            </p>
          </div>

          <div className="mt-10 sm:mt-14 grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-10">
            {/* Contact info */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Call us</div>
                    <div className="mt-1 text-sm text-muted-foreground space-y-1">
                      <div>
                        <a
                          href={`tel:${CONTACT.displayPhonePrimary}`}
                          className="hover:text-foreground truncate"
                        >
                          {CONTACT.displayPhonePrimary}
                        </a>{' '}
                        <span className="text-xs">(main)</span>
                      </div>
                      <div>
                        <a
                          href={`tel:${CONTACT.displayPhoneSecondary}`}
                          className="hover:text-foreground truncate"
                        >
                          {CONTACT.displayPhoneSecondary}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-5 h-5 text-accent-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">WhatsApp</div>
                    <a
                      href={`https://wa.me/${CONTACT.whatsappNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 block text-sm text-muted-foreground hover:text-foreground truncate"
                    >
                      {CONTACT.displayWhatsApp}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Email</div>
                    <a
                      href={`mailto:${CONTACT.email}`}
                      className="mt-1 block text-sm text-muted-foreground hover:text-foreground truncate"
                    >
                      {CONTACT.displayEmail}
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">Based in</div>
                    <div className="mt-1 text-sm text-muted-foreground truncate">
                      {CONTACT.location}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-3">
              <Card className="border-border">
                <CardContent className="p-5 sm:p-6 lg:p-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-name">Name *</Label>
                      <Input
                        id="d-name"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Your full name"
                      />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-business">Business / Organisation *</Label>
                      <Input
                        id="d-business"
                        value={form.business}
                        onChange={(e) => setForm({ ...form, business: e.target.value })}
                        placeholder="e.g. Acme Factory"
                      />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-industry">Industry</Label>
                      <Select
                        value={form.industry}
                        onValueChange={(v) => setForm({ ...form, industry: v })}
                      >
                        <SelectTrigger id="d-industry">
                          <SelectValue placeholder="Choose your industry" />
                        </SelectTrigger>
                        <SelectContent>
                          {INDUSTRIES.map((i) => (
                            <SelectItem key={i.key} value={i.key}>
                              {i.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-role">Role</Label>
                      <Input
                        id="d-role"
                        value={form.role}
                        onChange={(e) => setForm({ ...form, role: e.target.value })}
                        placeholder="e.g. Owner, Manager"
                      />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-phone">Phone *</Label>
                      <Input
                        id="d-phone"
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="e.g. 07XX XXX XXX"
                      />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label htmlFor="d-email">Email</Label>
                      <Input
                        id="d-email"
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@company.com"
                      />
                    </div>
                    <div className="space-y-2 min-w-0 sm:col-span-2">
                      <Label htmlFor="d-message">Message</Label>
                      <Textarea
                        id="d-message"
                        rows={4}
                        value={form.message}
                        onChange={(e) => setForm({ ...form, message: e.target.value })}
                        placeholder="Tell us a bit about your setup, team size, locations..."
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={sendWhatsApp}
                      className="w-full sm:w-auto gradient-primary text-primary-foreground font-semibold px-6 py-3 rounded-xl shadow-glow hover:opacity-95 transition inline-flex items-center justify-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Send via WhatsApp
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={sendEmail}
                      className="w-full sm:w-auto h-auto px-6 py-3 rounded-xl"
                    >
                      <Mail className="w-4 h-4 mr-2" />
                      Send via Email
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="sm:col-span-2 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1">
                  <img
                    src="/cunga-logo-nobg.png"
                    alt="Cunga Stock"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold truncate">Cunga Stock</div>
                  <div className="text-xs opacity-70 truncate">
                    Inventory Management, Your Way
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm opacity-80 max-w-md">
                One inventory platform that adapts to clothing stores, factories, shops, warehouses and more —
                so your team spends less time on paperwork and more time growing the business.
              </p>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold">Product</div>
              <ul className="mt-4 space-y-2 text-sm opacity-80">
                <li>
                  <a href="#features" className="hover:opacity-100">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#industries" className="hover:opacity-100">
                    Industries
                  </a>
                </li>
                <li>
                  <a href="#how" className="hover:opacity-100">
                    How it works
                  </a>
                </li>
                <li>
                  <Link to="/auth" className="hover:opacity-100">
                    Login
                  </Link>
                </li>
              </ul>
            </div>

            <div className="min-w-0">
              <div className="text-sm font-semibold">Contact</div>
              <ul className="mt-4 space-y-2 text-sm opacity-80">
                <li className="truncate">
                  <a href={`tel:${CONTACT.displayPhonePrimary}`} className="hover:opacity-100">
                    {CONTACT.displayPhonePrimary}
                  </a>
                </li>
                <li className="truncate">
                  <a href={`tel:${CONTACT.displayPhoneSecondary}`} className="hover:opacity-100">
                    {CONTACT.displayPhoneSecondary}
                  </a>
                </li>
                <li className="truncate">
                  <a
                    href={`https://wa.me/${CONTACT.whatsappNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:opacity-100"
                  >
                    WhatsApp: {CONTACT.displayWhatsApp}
                  </a>
                </li>
                <li className="truncate">
                  <a href={`mailto:${CONTACT.email}`} className="hover:opacity-100">
                    {CONTACT.displayEmail}
                  </a>
                </li>
                <li className="truncate">{CONTACT.location}</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-sidebar-border/50 text-xs opacity-70 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>© {new Date().getFullYear()} Cunga Stock. All rights reserved.</div>
            <div>Made with care in {CONTACT.location}.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
