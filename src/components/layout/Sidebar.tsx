import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  LayoutDashboard,
  Package,
  FolderOpen,
  History,
  FileText,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  Settings,
  Bell,
  Shirt,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/stock', label: 'Stock Items', icon: Package, badge: 'New' },
  { path: '/categories', label: 'Categories', icon: FolderOpen },
  { path: '/uniform', label: 'Uniform Inventory', icon: Shirt }, // Added Uniforms here
  { path: '/temporary-stock', label: 'Temporary Stock', icon: Timer },
  { path: '/movements', label: 'History', icon: History },
  { path: '/reports', label: 'Reports', icon: FileText },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, profile, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col transition-all duration-300 ease-in-out',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div className={cn(
        'flex items-center h-16 px-3 border-b border-sidebar-border',
        collapsed ? 'justify-center' : 'gap-2.5'
      )}>
        <img
          src="/cunga-logo-nobg.png"
          alt="Cunga Stock"
          className="w-11 h-11 rounded-lg object-contain bg-white p-0.5 flex-shrink-0 shadow-md"
        />
        {!collapsed && (
          <div className="animate-fade-in overflow-hidden">
            <h1 className="font-bold text-base leading-tight text-sidebar-foreground">Cunga Stock</h1>
            <p className="text-[11px] text-sidebar-foreground/55 leading-none mt-0.5">Management System</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className={cn(
          'text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3',
          collapsed ? 'text-center' : 'px-3'
        )}>
          {collapsed ? '•••' : 'Menu'}
        </div>
        
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          const button = (
            <Link key={item.path} to={item.path} className="block">
              <Button
                variant="ghost"
                className={cn(
                  'w-full gap-3 transition-all duration-200',
                  collapsed ? 'justify-center px-2' : 'justify-start px-3',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 shadow-md'
                    : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
                )}
              >
                <Icon className={cn('h-5 w-5 flex-shrink-0', isActive && 'animate-scale-in')} />
                {!collapsed && (
                  <span className="flex-1 text-left">{item.label}</span>
                )}
                {!collapsed && item.badge && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 bg-accent text-accent-foreground">
                    {item.badge}
                  </Badge>
                )}
              </Button>
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path} delayDuration={0}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="right" className="font-medium">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return button;
        })}
      </nav>

      {/* Bottom Section */}
      <div className="mt-auto border-t border-sidebar-border p-3 space-y-2">
        <div className={cn('flex gap-1', collapsed ? 'flex-col' : 'justify-center')}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              >
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link to="/notifications">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent relative"
                >
                  <Bell className="w-5 h-5" />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Notifications</TooltipContent>
          </Tooltip>

          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link to="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn(
          'flex items-center gap-3 p-2 rounded-lg bg-sidebar-accent/50',
          collapsed && 'justify-center'
        )}>
          <Avatar className="h-9 w-9 flex-shrink-0">
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
              {profile?.full_name ? getInitials(profile.full_name) : 'U'}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0 animate-fade-in">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {user?.email}
              </p>
            </div>
          )}
          {!collapsed && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={signOut}
                  className="text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign Out</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onToggle}
        className={cn(
          'absolute -right-3 top-20 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar shadow-md',
          'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
        )}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </aside>
  );
}