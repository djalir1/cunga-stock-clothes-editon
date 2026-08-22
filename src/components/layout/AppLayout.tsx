import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useStockItems } from '@/hooks/useStockItems';
import { useCategories } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  History,
  FileText,
  LogOut,
  Sun,
  Moon,
  Menu,
  Bell,
  Search as SearchIcon,
  X,
  Shirt,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar } from './Sidebar';
import { Input } from '@/components/ui/input';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/stock', label: 'Stock Items', icon: Package },
  { path: '/categories', label: 'Categories', icon: FolderOpen },
  { path: '/uniform', label: 'Uniform Inventory', icon: Shirt },
  { path: '/temporary-stock', label: 'Temporary Stock', icon: Timer },
  { path: '/movements', label: 'History', icon: History },
  { path: '/reports', label: 'Reports', icon: FileText },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const { items } = useStockItems();
  const { categories } = useCategories();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Combined search results (items + categories)
  const searchResults = searchQuery.trim().length < 2
    ? []
    : [
        ...items
          .filter(item =>
            item.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(item => ({
            type: 'item' as const,
            id: item.id,
            name: item.name,
            category: item.category?.name || 'Uncategorized',
          })),
        ...categories
          .filter(cat =>
            cat.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
          .map(cat => ({
            type: 'category' as const,
            id: cat.id,
            name: cat.name,
            color: cat.color,
          })),
      ].slice(0, 10); // limit to top 10 results

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const currentPage = navItems.find(item => item.path === location.pathname);

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Node).closest('.search-container')) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      </div>

      {/* Main Content */}
      <div className={cn(
        'min-h-screen transition-all duration-300',
        'lg:ml-64',
        sidebarCollapsed && 'lg:ml-20'
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-border bg-card/80 backdrop-blur-xl">
          <div className="flex h-full items-center justify-between px-4 lg:px-6">
            {/* Left */}
            <div className="flex items-center gap-4">
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
                  {/* Mobile sidebar content */}
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-3 h-16 px-4 border-b border-sidebar-border">
                      <img
                        src="/cunga-logo-nobg.png"
                        alt="Cunga Stock"
                        className="w-11 h-11 rounded-lg object-contain bg-white p-0.5 flex-shrink-0 shadow-md"
                      />
                      <div>
                        <h1 className="font-bold text-lg leading-none text-sidebar-foreground">Cunga Stock</h1>
                        <p className="text-xs text-sidebar-foreground/60">Management System</p>
                      </div>
                    </div>

                    <nav className="flex-1 px-3 py-4 space-y-1">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Button
                              variant="ghost"
                              className={cn(
                                'w-full justify-start gap-3 px-3',
                                isActive
                                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                              )}
                            >
                              <Icon className="h-5 w-5" />
                              {item.label}
                            </Button>
                          </Link>
                        );
                      })}
                    </nav>

                    <div className="border-t border-sidebar-border p-3">
                      <div className="flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
                            {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-sidebar-foreground truncate">
                            {profile?.full_name || 'User'}
                          </p>
                          <p className="text-xs text-sidebar-foreground/60 truncate">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        className="w-full mt-2 justify-start gap-2 text-sidebar-foreground/70 hover:text-destructive"
                        onClick={signOut}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign Out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>

              <div>
                <h1 className="text-lg font-semibold">{currentPage?.label || 'Dashboard'}</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  Welcome back, {profile?.full_name?.split(' ')[0] || 'User'}
                </p>
              </div>
            </div>
            {/* ... remaining search and header code stays the same ... */}
            <div className="flex items-center gap-3">
              <div className="relative search-container w-64 md:w-80">
                <div className="relative">
                  <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Search items or categories..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(true);
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    className="pl-9 pr-10 bg-muted/50 border-0 focus-visible:ring-1"
                  />
                  {searchQuery && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
              </Button>

              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
              </Button>

              <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-border">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                    {profile?.full_name ? getInitials(profile.full_name) : 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}