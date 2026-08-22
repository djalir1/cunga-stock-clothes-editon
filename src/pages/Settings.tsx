import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  Bell, 
  Shield, 
  Palette, 
  Database,
  LogOut,
  Save,
  Moon,
  Sun,
  Mail,
  Key
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function Settings() {
  const { user, profile, role, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // Notification settings (local state for demo)
  const [notifications, setNotifications] = useState({
    lowStock: true,
    stockMovements: true,
    dailyReport: false,
    emailAlerts: true,
  });

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Profile
          </CardTitle>
          <CardDescription>Manage your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <Avatar className="h-20 w-20">
              <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                {profile?.full_name ? getInitials(profile.full_name) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <h3 className="text-xl font-semibold">{profile?.full_name || 'User'}</h3>
              <p className="text-muted-foreground flex items-center gap-2">
                <Mail className="w-4 h-4" />
                {user?.email}
              </p>
              <Badge variant="outline" className="capitalize">
                <Shield className="w-3 h-3 mr-1" />
                {role || 'storekeeper'}
              </Badge>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input 
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ''} disabled className="bg-muted" />
            </div>
          </div>

          <Button onClick={handleUpdateProfile} disabled={isSaving} className="gap-2">
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      {/* Appearance Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="w-5 h-5" />
            Appearance
          </CardTitle>
          <CardDescription>Customize how the app looks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {theme === 'light' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">
                  Currently using {theme} mode
                </p>
              </div>
            </div>
            <Switch checked={theme === 'dark'} onCheckedChange={toggleTheme} />
          </div>
        </CardContent>
      </Card>

      {/* Notifications Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" />
            Notifications
          </CardTitle>
          <CardDescription>Configure your notification preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Low Stock Alerts</p>
              <p className="text-sm text-muted-foreground">Get notified when items are running low</p>
            </div>
            <Switch 
              checked={notifications.lowStock} 
              onCheckedChange={(checked) => setNotifications({ ...notifications, lowStock: checked })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Stock Movements</p>
              <p className="text-sm text-muted-foreground">Notifications for stock in/out activities</p>
            </div>
            <Switch 
              checked={notifications.stockMovements} 
              onCheckedChange={(checked) => setNotifications({ ...notifications, stockMovements: checked })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Daily Summary Report</p>
              <p className="text-sm text-muted-foreground">Receive daily stock summary via email</p>
            </div>
            <Switch 
              checked={notifications.dailyReport} 
              onCheckedChange={(checked) => setNotifications({ ...notifications, dailyReport: checked })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Alerts</p>
              <p className="text-sm text-muted-foreground">Receive important alerts via email</p>
            </div>
            <Switch 
              checked={notifications.emailAlerts} 
              onCheckedChange={(checked) => setNotifications({ ...notifications, emailAlerts: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            System Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Version</p>
              <p className="font-mono font-semibold">1.0.0</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Last Login</p>
              <p className="font-semibold">{new Date().toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Key className="w-5 h-5" />
            Account Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={signOut} className="gap-2">
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
